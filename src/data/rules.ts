// Every number the rule book fixes lives here, so play-testing changes stay in one place.

export const RULES = {
  minPlayers: 2,
  maxPlayers: 6,
  startCash: 1000,
  startBonus: 200,
  startBonusPoints: 10,
  turnSeconds: 30,

  // Building: level 0 = empty land … 5 = skyscraper.
  maxLevel: 5,
  buildCostRate: 0.4,
  stopBuildLevels: 2,
  passBuildLevels: 1,
  tollRate: [0.2, 0.5, 1.0, 1.5, 2.2, 3.0],
  neighbourTollBonus: 0.5,
  buildPoints: 5,

  // Money.
  interestRate: 0.02,
  hospitalFee: 50,
  bailFee: 100,
  flightFee: 100,
  rescueCash: 500,
  rescues: 1,
  sellRate: 0.5,

  // Holdings.
  maxCards: 8,
  maxItems: 6,

  // Gods.
  godDays: 3,
  mapGodDays: 5,

  vehicleDays: 5,
  waterBalloonDays: 5,
  teamUpDays: 3,
  priceUpDays: 3,
  turtleTurns: 3,
};

export const BUILDINGS = ['Empty land', 'Tent', 'Cabin', 'Holiday House', 'Hotel', 'Skyscraper'] as const;

export const SPECIALS = {
  park: { name: 'Park', desc: 'Your park pays you $50 every time you pass through its region.' },
  mall: { name: 'Shopping Mall', desc: 'Visitors spin the wheel and pay you the number × $50.' },
  petrol: { name: 'Petrol Station', desc: 'Visitors riding a scooter or car pay you $100 for fuel.' },
  theme: { name: 'Theme Park', desc: 'Toll is 1.5 times a skyscraper toll.' },
} as const;
export type SpecialId = keyof typeof SPECIALS;
