// Cards, items, gods, chance events, news and characters.

export type CardId =
  | 'freePass'
  | 'getOutFree'
  | 'tax'
  | 'fairShare'
  | 'swapHouse'
  | 'priceUp'
  | 'teamUp'
  | 'turtle'
  | 'sleep'
  | 'boomerang'
  | 'rebuild'
  | 'godCall';

export type Target = 'none' | 'player' | 'myPlot' | 'swap' | 'myRegion' | 'rebuild';

export interface CardDef {
  name: string;
  desc: string;
  price: number;
  mean: boolean;
  target: Target;
  color: string;
}

export const CARDS: Record<CardId, CardDef> = {
  freePass: { name: 'Free Pass', desc: 'Your next toll is free.', price: 25, mean: false, target: 'none', color: '#1b8f6a' },
  getOutFree: { name: 'Get Out Free', desc: 'Keeps you out of Jail or Hospital once. Works by itself.', price: 25, mean: false, target: 'none', color: '#5b8c3a' },
  tax: { name: 'Tax Card', desc: 'A player pays 20% of their cash to the bank.', price: 35, mean: true, target: 'player', color: '#d6342c' },
  fairShare: { name: 'Fair Share', desc: "Everyone's cash is shared out equally.", price: 40, mean: true, target: 'none', color: '#c85a14' },
  swapHouse: { name: 'Swap House', desc: 'Swap one of your places with a friend’s, buildings and all.', price: 40, mean: true, target: 'swap', color: '#3a86ff' },
  priceUp: { name: 'Price Up', desc: 'Tolls in one of your regions are doubled for 3 days.', price: 35, mean: false, target: 'myRegion', color: '#e0a800' },
  teamUp: { name: 'Team Up', desc: 'You and a friend pay each other no tolls for 3 days.', price: 30, mean: false, target: 'player', color: '#0f8a8a' },
  turtle: { name: 'Turtle Card', desc: 'A player moves only 1 step for 3 turns.', price: 25, mean: true, target: 'player', color: '#2d9a55' },
  sleep: { name: 'Sleep Card', desc: 'A player skips their next turn.', price: 25, mean: true, target: 'player', color: '#5a4a8c' },
  boomerang: { name: 'Boomerang', desc: 'Turn around and go the other way.', price: 20, mean: false, target: 'none', color: '#c85a14' },
  rebuild: { name: 'Rebuild Card', desc: 'Turn one of your level 3+ buildings into a park, mall, petrol station or theme park.', price: 15, mean: false, target: 'rebuild', color: '#7b4fc0' },
  godCall: { name: 'God Call', desc: 'Send away the god with you, or call a good god.', price: 30, mean: false, target: 'none', color: '#e0457b' },
};
export const CARD_IDS = Object.keys(CARDS) as CardId[];

export type ItemId = 'remoteDice' | 'roadblock' | 'banana' | 'waterBalloon' | 'robot' | 'rocket' | 'scooter' | 'car';
export type ItemTarget = 'none' | 'distance' | 'player' | 'anyPlot' | 'value';

export interface ItemDef {
  name: string;
  desc: string;
  price: number;
  mean: boolean;
  target: ItemTarget;
  color: string;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  remoteDice: { name: 'Remote Dice', desc: 'Choose where the wheel stops (1–6).', price: 30, mean: false, target: 'value', color: '#22a45d' },
  roadblock: { name: 'Roadblock', desc: 'Put a roadblock 1–6 spaces ahead. Whoever reaches it must stop.', price: 30, mean: true, target: 'distance', color: '#f08a1c' },
  banana: { name: 'Banana Trap', desc: 'Drop a banana 1–6 spaces ahead. Whoever steps on it slips to Hospital for 2 turns.', price: 25, mean: true, target: 'distance', color: '#e0a800' },
  waterBalloon: { name: 'Water Balloon', desc: 'Give it to a player. It bursts after 5 days and sends its holder to Hospital. Pass it on by walking past someone!', price: 25, mean: true, target: 'player', color: '#3a86ff' },
  robot: { name: 'Robot Helper', desc: 'Clears roadblocks and bananas 10 spaces ahead.', price: 15, mean: false, target: 'none', color: '#566079' },
  rocket: { name: 'Firework Rocket', desc: 'Knocks 1 level off any building. Anyone standing there goes to Hospital for 1 turn.', price: 100, mean: true, target: 'anyPlot', color: '#d6342c' },
  scooter: { name: 'Scooter', desc: 'Spin 2 wheels for 10 days.', price: 80, mean: false, target: 'none', color: '#1b9aaa' },
  car: { name: 'Car', desc: 'Spin 3 wheels for 10 days.', price: 150, mean: false, target: 'none', color: '#d6342c' },
};
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

export type GodId = 'wealth' | 'fortune' | 'land' | 'angel' | 'badLuck' | 'poverty' | 'devil';

export const GODS: Record<GodId, { name: string; good: boolean; color: string; desc: string }> = {
  wealth: { name: 'God of Wealth', good: true, color: '#e0a800', desc: 'Gives you $200. You pay no tolls while he stays.' },
  fortune: { name: 'God of Fortune', good: true, color: '#e0457b', desc: 'Gives you a card. Every build goes up one extra level. Saves you from one bad thing.' },
  land: { name: 'Land God', good: true, color: '#8a5a33', desc: 'Empty land you pass becomes yours for free.' },
  angel: { name: 'Angel', good: true, color: '#3aa6df', desc: 'Every building you pass grows 1 level.' },
  badLuck: { name: 'God of Bad Luck', good: false, color: '#5a4a8c', desc: 'You pay double tolls. Walk past a player to give him away!' },
  poverty: { name: 'God of Poverty', good: false, color: '#7a6a55', desc: 'You lose 10% of your cash every morning. Walk past a player to give him away!' },
  devil: { name: 'Devil', good: false, color: '#c62f3a', desc: 'Every building you pass loses 1 level. Walk past a player to give him away!' },
};
export const GOD_IDS = Object.keys(GODS) as GodId[];

export type ChanceEffect =
  | { kind: 'cash'; amount: number }
  | { kind: 'speeding' }
  | { kind: 'loseVehicle' }
  | { kind: 'nextRegion' }
  | { kind: 'skip'; turns: number }
  | { kind: 'card' }
  | { kind: 'birthday'; amount: number }
  | { kind: 'hospital'; turns: number };

export const CHANCES: { text: string; effect: ChanceEffect }[] = [
  { text: 'You found an opal! Collect $100.', effect: { kind: 'cash', amount: 100 } },
  { text: 'You won a surfing contest! Collect $80.', effect: { kind: 'cash', amount: 80 } },
  { text: 'A cheeky magpie stole your lunch money. Lose $20.', effect: { kind: 'cash', amount: -20 } },
  { text: 'Speeding ticket! Pay $50 if you have a scooter or car.', effect: { kind: 'speeding' } },
  { text: 'Your camper van broke down. You lose your scooter or car.', effect: { kind: 'loseVehicle' } },
  { text: 'Free ride to the next region!', effect: { kind: 'nextRegion' } },
  { text: 'Lost in the bush. Skip 1 turn.', effect: { kind: 'skip', turns: 1 } },
  { text: 'A tourist bought you a souvenir card!', effect: { kind: 'card' } },
  { text: 'Birthday party! Everyone gives you $20.', effect: { kind: 'birthday', amount: 20 } },
  { text: 'Oops, a snake! Rest in Hospital for 1 turn.', effect: { kind: 'hospital', turns: 1 } },
];

export type NewsEffect =
  | { kind: 'everyone'; amount: number }
  | { kind: 'petrol'; amount: number }
  | { kind: 'boom' }
  | { kind: 'cyclone' }
  | { kind: 'topLandowner'; amount: number }
  | { kind: 'luckyDraw'; amount: number }
  | { kind: 'bankBonus' }
  | { kind: 'moreGods' };

export const NEWS: { headline: string; text: string; effect: NewsEffect }[] = [
  { headline: 'Australia Day holiday!', text: 'Everyone gets $50.', effect: { kind: 'everyone', amount: 50 } },
  { headline: 'Petrol prices go up!', text: 'Everyone with a scooter or car pays $30.', effect: { kind: 'petrol', amount: 30 } },
  { headline: 'Tourist boom!', text: 'Tolls in one region are 50% higher today.', effect: { kind: 'boom' } },
  { headline: 'Cyclone in the north!', text: 'Three buildings up north lose a level.', effect: { kind: 'cyclone' } },
  { headline: 'Top landowner award!', text: 'The player with the most places gets $200.', effect: { kind: 'topLandowner', amount: 200 } },
  { headline: 'Lucky draw!', text: 'The player with the least cash gets $100.', effect: { kind: 'luckyDraw', amount: 100 } },
  { headline: 'Bank pays a bonus!', text: 'Savings interest is doubled today.', effect: { kind: 'bankBonus' } },
  { headline: 'Gods on holiday!', text: 'Two more gods appear on the roads.', effect: { kind: 'moreGods' } },
];

export interface CharacterDef {
  id: string;
  animal: string;
  color: string;
  lines: { buy: string[]; toll: string[]; build: string[]; ouch: string[] };
}

export const CHARACTERS: CharacterDef[] = [
  { id: 'kangaroo', animal: 'Kangaroo', color: '#e8772e', lines: { buy: ["G'day, this street is mine!", 'Hop hop, sold!'], toll: ['Thanks for the cash, mate!', 'Pay up, please!'], build: ['Up it goes!', 'Bigger and better!'], ouch: ['Strewth!', 'Not again!'] } },
  { id: 'koala', animal: 'Koala', color: '#7a8798', lines: { buy: ['I will take this one, thanks.', 'A comfy spot for me!'], toll: ['Cheers for visiting!', 'Every bit helps!'], build: ['Time to build!', 'Cosy and tall!'], ouch: ['Oh no, my gum leaves!', 'Grumble grumble.'] } },
  { id: 'wombat', animal: 'Wombat', color: '#8a5a33', lines: { buy: ['Dig in, this is mine!', 'Good solid ground.'], toll: ['Pay the wombat toll!', 'Nice one!'], build: ['Dig, dig, build!', 'Stronger now!'], ouch: ['Ouch, my nose!', 'Bother!'] } },
  { id: 'quokka', animal: 'Quokka', color: '#d6342c', lines: { buy: ['Smile! I bought it!', 'Happiest buyer ever!'], toll: ['Thank you, friend!', 'Smile and pay!'], build: ['Look at it grow!', 'Yay, bigger!'], ouch: ['Aww, no fair!', 'Oopsie!'] } },
  { id: 'platypus', animal: 'Platypus', color: '#1b9aaa', lines: { buy: ['Splash! Mine now.', 'Quack-tastic buy!'], toll: ['Thanks for the splash cash!', 'Paddle over the money!'], build: ['Building a bigger burrow!', 'Swim up, level up!'], ouch: ['Blub blub, oh no!', 'That stings!'] } },
  { id: 'emu', animal: 'Emu', color: '#2a6db5', lines: { buy: ['Zoom! Bought it!', 'Fastest buyer in the outback!'], toll: ['Pay the speedy emu!', 'Thanks, mate!'], build: ['Tall like me!', 'Up, up, up!'], ouch: ['Feathers ruffled!', 'Whoa there!'] } },
];
export const characterById = (id: string) => CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
