// 12x12 pixel-art ikonky (vlastné)
const PAL = {
  K: '#111', W: '#fff', Y: '#f2cf2a', R: '#d33', G: '#4cbf3a', g: '#2d7a25', B: '#3b7de0', b: '#1d4a99',
  O: '#e8822a', N: '#8a5a2f', S: '#a8a8a8', s: '#5a5a5a', C: '#6fd6ff', P: '#c060d0', L: '#cfe8ff', T: '#3a3a3a',
};
const ICONS = {
  query: [
    '....KKKK....', '...KLLLLK...', '..KLWLLLLK..', '..KLLLLLLK..', '..KLLLLLLK..', '..KLLLLLLK..',
    '...KLLLLK...', '....KKKKN...', '........NN..', '.........NN.', '..........NN', '............'],
  bulldoze: [
    '............', '....YYYY....', '....YLLY....', '..YYYYYYYY..', '..YYYYYYYYS.', '..YYYYYYYYSS',
    '..ssssssss.S', '.sKsKsKsKs.S', '.ssssssssss.', '............', '............', '............'],
  terrain: [
    '............', '.....W......', '....WWS.....', '...SSSSS....', '...SSSSSS.W.', '..sSSSSSSWWS',
    '..sSSSgSSSSS', '.gGGGGgGGSSS', '.GGGGGGGGGGg', 'NNNNNNNNNNNN', 'NNNNNNNNNNNN', '............'],
  road: [
    '...S....S...', '...STTTTS...', '...STTTTS...', '...STTYTS...', '...STTYTS...', '...STTTTS...',
    '...STTTTS...', '...STTYTS...', '...STTYTS...', '...STTTTS...', '...STTTTS...', '...S....S...'],
  power: [
    '.......YY...', '......YY....', '.....YY.....', '....YYY.....', '...YYYYYYY..', '.......YY...',
    '......YY....', '.....YY.....', '....YY......', '...YY.......', '..Y.........', '............'],
  water: [
    '.....B......', '.....B......', '....BBB.....', '....BCB.....', '...BBCBB....', '...BCBBB....',
    '..BBCBBBB...', '..BCBBBBB...', '..BBBBBBb...', '...BBBBb....', '....bbb.....', '............'],
  res: [
    '............', '.....RR.....', '....RRRR....', '...RRRRRR...', '..RRRRRRRR..', '...WWWWWW...',
    '...WBWWBW...', '...WWWWWW...', '...WWNNWW...', '...WWNNWW...', '.GGGGGGGGGG.', '............'],
  com: [
    '....bbbb....', '....BLBL....', '....BBBB....', '..bbBLBLbb..', '..BLBBBBLB..', '..BBBLBLBB..',
    '..BLBBBBLB..', '..BBBLBLBB..', '..BLBBBBLB..', '..BBBBBBBB..', '.SSSSSSSSSS.', '............'],
  ind: [
    '.S......S...', '..S....S....', '.ss....ss...', '.ss....ss...', '.ss....ss...', '.ssY..Yss...',
    '.sYYYYYYYYY.', '.sYYYYYYYYY.', '.sYKKYYKKYY.', '.sYYYYYYYYY.', 'NNNNNNNNNNNN', '............'],
  dezone: [
    '............', '.R........R.', '..R......R..', '...R....R...', '....R..R....', '.....RR.....',
    '.....RR.....', '....R..R....', '...R....R...', '..R......R..', '.R........R.', '............'],
  services: [
    '............', '....RRRR....', '....RRRR....', '....RRRR....', '.RRRRRRRRRR.', '.RRRRRRRRRR.',
    '.RRRRRRRRRR.', '.RRRRRRRRRR.', '....RRRR....', '....RRRR....', '....RRRR....', '............'],
  parks: [
    '.....gg.....', '....gGGg....', '...gGGGGg...', '..gGGGGGGg..', '..gGGGGGGg..', '...gGGGGg...',
    '....gGGg....', '.....NN.....', '.....NN.....', '.....NN.....', '.GGGGGGGGGG.', '............'],
  special: [
    '.....Y......', '.....Y......', '....YYY.....', 'YYYYYYYYYYY.', '.YYYYYYYYY..', '..YYYYYYY...',
    '...YYYYY....', '..YYY.YYY...', '..YY...YY...', '.YY.....YY..', '.Y.......Y..', '............'],
};

export function iconCanvas(name, scale = 2) {
  const data = ICONS[name] || ICONS.query;
  const cv = document.createElement('canvas');
  cv.width = 12 * scale; cv.height = 12 * scale;
  const ctx = cv.getContext('2d');
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
    const c = data[y][x];
    if (c === '.' || !c) continue;
    ctx.fillStyle = PAL[c] || '#f0f';
    ctx.fillRect(x * scale, y * scale, scale, scale);
  }
  cv.className = 'pix';
  return cv;
}
