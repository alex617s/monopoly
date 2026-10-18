// Voice / video for players in the same room. Every pair of players in the
// call is connected directly (a small mesh), which is fine for up to 4 people.

import type Peer from 'peerjs';
import type { MediaConnection } from 'peerjs';

export interface RemoteMedia {
  peerId: string;
  stream: MediaStream;
}

export interface MediaSnapshot {
  inCall: boolean;
  mic: boolean;
  cam: boolean;
  local: MediaStream | null;
  remotes: RemoteMedia[];
  error: string | null;
}

export class MediaMesh {
  private local: MediaStream | null = null;
  private calls = new Map<string, MediaConnection>();
  private remotes = new Map<string, MediaStream>();
  private allowed = new Set<string>();
  private listeners = new Set<() => void>();
  private snap: MediaSnapshot;
  inCall = false;
  mic = true;
  cam = false;
  error: string | null = null;

  constructor(private peer: Peer, private onLocalChange: () => void) {
    this.snap = this.build();
    peer.on('call', (call) => this.onIncoming(call));
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;

  private build(): MediaSnapshot {
    return {
      inCall: this.inCall,
      mic: this.mic,
      cam: this.cam,
      local: this.local,
      remotes: [...this.remotes].map(([peerId, stream]) => ({ peerId, stream })),
      error: this.error,
    };
  }

  private emit() {
    this.snap = this.build();
    this.listeners.forEach((l) => l());
  }

  async join() {
    if (this.inCall) return;
    try {
      this.local = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    } catch {
      this.error = 'Could not use the microphone. Please allow microphone access and try again.';
      this.emit();
      return;
    }
    this.error = null;
    this.inCall = true;
    this.mic = true;
    this.cam = false;
    this.emit();
    this.onLocalChange();
  }

  leave() {
    this.inCall = false;
    this.cam = false;
    this.calls.forEach((c) => c.close());
    this.calls.clear();
    this.remotes.clear();
    this.local?.getTracks().forEach((t) => t.stop());
    this.local = null;
    this.emit();
    this.onLocalChange();
  }

  setMic(on: boolean) {
    this.mic = on;
    this.local?.getAudioTracks().forEach((t) => (t.enabled = on));
    this.emit();
    this.onLocalChange();
  }

  async setCam(on: boolean) {
    if (!this.local) return;
    const existing = this.local.getVideoTracks()[0];
    if (on && !existing) {
      try {
        const v = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' } });
        this.local.addTrack(v.getVideoTracks()[0]);
      } catch {
        this.error = 'Could not use the camera. Please allow camera access.';
        this.emit();
        return;
      }
      // A new track needs fresh connections: redial everyone with the new stream.
      this.cam = true;
      const targets = [...this.allowed];
      this.calls.forEach((c) => c.close());
      this.calls.clear();
      targets.forEach((id) => this.dial(id));
    } else if (existing) {
      existing.enabled = on;
      this.cam = on;
    }
    this.error = null;
    this.emit();
    this.onLocalChange();
  }

  /** Called whenever the room's member list changes. */
  syncPeers(peersInCall: string[]) {
    const myId = this.peer.id;
    this.allowed = new Set(peersInCall.filter((id) => id !== myId));
    for (const [id, call] of this.calls) {
      if (!this.allowed.has(id)) {
        call.close();
        this.calls.delete(id);
        this.remotes.delete(id);
      }
    }
    if (!this.inCall || !this.local) {
      this.emit();
      return;
    }
    for (const id of this.allowed) {
      // The lower id dials so two people never call each other at once.
      if (!this.calls.has(id) && myId < id) this.dial(id);
    }
    this.emit();
  }

  private dial(id: string) {
    if (!this.local) return;
    const call = this.peer.call(id, this.local);
    if (call) this.track(id, call);
  }

  private onIncoming(call: MediaConnection) {
    if (!this.inCall || !this.local || !this.allowed.has(call.peer)) {
      call.close();
      return;
    }
    this.calls.get(call.peer)?.close();
    call.answer(this.local);
    this.track(call.peer, call);
  }

  private track(id: string, call: MediaConnection) {
    this.calls.set(id, call);
    call.on('stream', (stream) => {
      this.remotes.set(id, stream);
      this.emit();
    });
    const drop = () => {
      if (this.calls.get(id) === call) {
        this.calls.delete(id);
        this.remotes.delete(id);
        this.emit();
      }
    };
    call.on('close', drop);
    call.on('error', drop);
  }
}
