// Mestopolis – herné konštanty a definície
export const HS = 0.34;        // výška jednej úrovne terénu (svetové jednotky)
export const FLOOR = 0.115;    // výška poschodia
export const CHUNK = 16;       // veľkosť bloku pre renderovanie
export const MAX_H = 24;       // max. výška terénu
export const SEA = 3;          // hladina mora (úroveň)

// zóny
export const Z = { NONE: 0, R1: 1, R2: 2, C1: 3, C2: 4, I1: 5, I2: 6 };
export const zoneKind = z => (z === 0 ? 0 : z <= 2 ? 1 : z <= 4 ? 2 : 3); // 1=R 2=C 3=I
export const zoneDense = z => z === 2 || z === 4 || z === 6;
export const KIND_NAME = ['', 'Obytná', 'Obchodná', 'Priemyselná'];

// obyvatelia / pracovné miesta podľa úrovne zástavby
export const POP = [
  null,
  [0, 10, 28, 110, 280, 620],   // R
  [0, 6, 18, 80, 190, 420],     // C
  [0, 8, 22, 70, 140, 220],     // I
];
export const MAXLVL = { light: 2, denseR: 5, denseC: 5, denseI: 4 };

// spotreba energie (MW) na úroveň
export const powerUse = lvl => 0.12 + lvl * 0.16;
export const waterUse = lvl => lvl * 0.3;

// služby a špeciálne budovy
export const BUILDINGS = {
  coal:    { name: 'Uhoľná elektráreň', size: 4, cost: 4000, upkeep: 60, power: 220, poll: 255, year: 1900, cat: 'power' },
  hydro:   { name: 'Vodná elektráreň', size: 1, cost: 400, upkeep: 4, power: 22, poll: 0, year: 1900, cat: 'power', needsWaterEdge: true },
  gas:     { name: 'Plynová elektráreň', size: 3, cost: 2000, upkeep: 40, power: 60, poll: 110, year: 1950, cat: 'power' },
  nuclear: { name: 'Jadrová elektráreň', size: 4, cost: 15000, upkeep: 200, power: 550, poll: 8, year: 1955, cat: 'power' },
  wind:    { name: 'Veterná turbína', size: 1, cost: 100, upkeep: 2, power: 5, poll: 0, year: 1980, cat: 'power' },
  solar:   { name: 'Solárna elektráreň', size: 4, cost: 1300, upkeep: 30, power: 60, poll: 0, year: 2000, cat: 'power' },
  fusion:  { name: 'Fúzna elektráreň', size: 4, cost: 40000, upkeep: 400, power: 2500, poll: 0, year: 2050, cat: 'power' },

  pump:    { name: 'Vodné čerpadlo', size: 1, cost: 100, upkeep: 6, water: 110, year: 1900, cat: 'water' },
  wtower:  { name: 'Vodojem', size: 2, cost: 250, upkeep: 8, water: 220, year: 1900, cat: 'water' },

  police:  { name: 'Policajná stanica', size: 2, cost: 500, upkeep: 100, radius: 15, fund: 'police', year: 1900, cat: 'safety' },
  fire:    { name: 'Hasičská stanica', size: 2, cost: 500, upkeep: 100, radius: 15, fund: 'fire', year: 1900, cat: 'safety' },
  hospital:{ name: 'Nemocnica', size: 2, cost: 500, upkeep: 100, radius: 18, fund: 'health', year: 1900, cat: 'health' },
  school:  { name: 'Základná škola', size: 2, cost: 250, upkeep: 60, radius: 16, fund: 'edu', year: 1900, cat: 'edu' },
  college: { name: 'Univerzita', size: 3, cost: 1000, upkeep: 150, radius: 32, fund: 'edu', year: 1900, cat: 'edu' },

  park:    { name: 'Malý park', size: 1, cost: 20, upkeep: 1, radius: 5, park: 70, year: 1900, cat: 'park' },
  bigpark: { name: 'Veľký park', size: 3, cost: 150, upkeep: 5, radius: 9, park: 140, year: 1900, cat: 'park' },
  fountain:{ name: 'Námestie s fontánou', size: 2, cost: 120, upkeep: 4, radius: 7, park: 110, year: 1900, cat: 'park' },
  playground:{ name: 'Detské ihrisko', size: 1, cost: 40, upkeep: 2, radius: 5, park: 80, year: 1900, cat: 'park' },
  garden:  { name: 'Kvetinová záhrada', size: 1, cost: 35, upkeep: 2, radius: 5, park: 85, year: 1900, cat: 'park' },
  pond:    { name: 'Park s jazierkom', size: 2, cost: 140, upkeep: 4, radius: 8, park: 130, year: 1900, cat: 'park' },
  sports:  { name: 'Športové ihrisko', size: 2, cost: 180, upkeep: 6, radius: 8, park: 100, year: 1900, cat: 'park' },
  botanic: { name: 'Botanická záhrada', size: 3, cost: 600, upkeep: 15, radius: 12, park: 170, year: 1920, cat: 'park' },
  zoo:     { name: 'Zoologická záhrada', size: 4, cost: 3000, upkeep: 60, radius: 18, park: 150, year: 1920, cat: 'park', attraction: 0.08 },
  funpark: { name: 'Zábavný park', size: 4, cost: 4500, upkeep: 90, radius: 18, park: 140, year: 1960, cat: 'park', attraction: 0.1 },

  landfill:{ name: 'Skládka odpadu', size: 3, cost: 300, upkeep: 20, radius: 26, garbage: 600, capacity: 90000, poll: 90, fund: 'waste', year: 1900, cat: 'waste' },
  incinerator:{ name: 'Spaľovňa odpadu', size: 2, cost: 2500, upkeep: 80, radius: 30, garbage: 900, power: 25, poll: 130, fund: 'waste', year: 1940, cat: 'waste' },
  recycling:{ name: 'Recyklačné centrum', size: 2, cost: 1800, upkeep: 70, radius: 28, garbage: 700, poll: 15, fund: 'waste', year: 1975, cat: 'waste' },
  cemetery:{ name: 'Cintorín', size: 2, cost: 250, upkeep: 10, graves: 2500, radius: 4, year: 1900, cat: 'death' },
  crematorium:{ name: 'Krematórium', size: 2, cost: 1500, upkeep: 60, cremate: 160, poll: 30, year: 1920, cat: 'death' },

  station: { name: 'Železničná stanica', size: 2, cost: 600, upkeep: 40, radius: 11, year: 1900, cat: 'transport', needsRailEdge: true },

  stadium: { name: 'Štadión', size: 4, cost: 5000, upkeep: 150, radius: 22, park: 60, year: 1900, cat: 'special' },
  seaport: { name: 'Prístav', size: 4, cost: 5000, upkeep: 120, poll: 80, year: 1900, cat: 'special', needsWaterEdge: true },
  airport: { name: 'Letisko', size: 6, cost: 10000, upkeep: 200, poll: 120, year: 1930, cat: 'special' },
  cityhall:{ name: 'Radnica', size: 3, cost: 3000, upkeep: 50, radius: 12, park: 50, year: 1900, cat: 'special', unique: true },
  arco:    { name: 'Arkológia', size: 4, cost: 100000, upkeep: 500, arcoPop: 45000, year: 2050, cat: 'special' },
};

export const COST = {
  road: 10, bridge: 50, pline: 5, plineWater: 25, pipe: 3, rail: 25, railBridge: 90,
  zoneLight: 5, zoneDense: 10, bulldoze: 1, bulldozeBld: 10, terra: 25, tree: 3,
};

// nástroje – zoskupené do skupín ako v klasických budovateľských hrách
export const TOOL_GROUPS = [
  { id: 'query', label: 'Info', items: [{ id: 'query', name: 'Informácie o pozemku' }] },
  { id: 'bulldoze', label: 'Búrať', items: [{ id: 'bulldoze', name: 'Buldozér', cost: COST.bulldoze }] },
  { id: 'terrain', label: 'Terén', items: [
    { id: 'raise', name: 'Zdvihnúť terén', cost: COST.terra },
    { id: 'lower', name: 'Znížiť terén', cost: COST.terra },
    { id: 'level', name: 'Vyrovnať terén', cost: COST.terra },
    { id: 'tree', name: 'Sadiť stromy', cost: COST.tree },
  ]},
  { id: 'road', label: 'Doprava', items: [
    { id: 'road', name: 'Cesta', cost: COST.road },
    { id: 'rail', name: 'Železnica', cost: COST.rail },
    { id: 'b:station' },
  ]},
  { id: 'power', label: 'Energia', items: [
    { id: 'pline', name: 'Elektrické vedenie', cost: COST.pline },
    { id: 'b:coal' }, { id: 'b:hydro' }, { id: 'b:gas' }, { id: 'b:nuclear' }, { id: 'b:wind' }, { id: 'b:solar' }, { id: 'b:fusion' },
  ]},
  { id: 'water', label: 'Voda', items: [
    { id: 'pipe', name: 'Vodovodné potrubie', cost: COST.pipe },
    { id: 'b:pump' }, { id: 'b:wtower' },
  ]},
  { id: 'res', label: 'Bývanie', items: [
    { id: 'z:1', name: 'Obytná zóna – riedka', cost: COST.zoneLight },
    { id: 'z:2', name: 'Obytná zóna – hustá', cost: COST.zoneDense },
  ]},
  { id: 'com', label: 'Obchod', items: [
    { id: 'z:3', name: 'Obchodná zóna – riedka', cost: COST.zoneLight },
    { id: 'z:4', name: 'Obchodná zóna – hustá', cost: COST.zoneDense },
  ]},
  { id: 'ind', label: 'Priemysel', items: [
    { id: 'z:5', name: 'Priemyselná zóna – riedka', cost: COST.zoneLight },
    { id: 'z:6', name: 'Priemyselná zóna – hustá', cost: COST.zoneDense },
  ]},
  { id: 'dezone', label: 'Odzónovať', items: [{ id: 'dezone', name: 'Zrušiť zónu', cost: 1 }] },
  { id: 'services', label: 'Služby', items: [
    { id: 'b:police' }, { id: 'b:fire' }, { id: 'b:hospital' }, { id: 'b:school' }, { id: 'b:college' },
  ]},
  { id: 'waste', label: 'Odpad a cintoríny', items: [
    { id: 'b:landfill' }, { id: 'b:incinerator' }, { id: 'b:recycling' }, { id: 'b:cemetery' }, { id: 'b:crematorium' },
  ]},
  { id: 'parks', label: 'Parky', items: [
    { id: 'b:park' }, { id: 'b:playground' }, { id: 'b:garden' }, { id: 'b:fountain' }, { id: 'b:pond' }, { id: 'b:sports' },
    { id: 'b:bigpark' }, { id: 'b:botanic' }, { id: 'b:zoo' }, { id: 'b:funpark' },
  ]},
  { id: 'special', label: 'Špeciálne', items: [
    { id: 'b:cityhall' }, { id: 'b:stadium' }, { id: 'b:seaport' }, { id: 'b:airport' }, { id: 'b:arco' },
  ]},
];

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Máj', 'Jún', 'Júl', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];

export const MILESTONES = [
  [500, 'Osada sa rozrástla na dedinu! (500 obyvateľov)'],
  [2000, 'Gratulujeme, máte mestečko! (2 000 obyvateľov)'],
  [10000, 'Mestečko je teraz mestom! (10 000 obyvateľov)'],
  [50000, 'Vaše mesto je teraz veľkomestom! (50 000 obyvateľov)'],
  [100000, 'Metropola! Viac ako 100 000 obyvateľov.'],
  [250000, 'Megapolis! Štvrť milióna obyvateľov.'],
];

export const fmtMoney = n => { const r = Math.round(n); return (r < 0 ? '-' : '') + Math.abs(r).toLocaleString('sk-SK') + ' €'; };
export const fmtNum = n => Math.round(n).toLocaleString('sk-SK');
