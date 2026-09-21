// manifest.json を読み、画像をロードする。無いものはコード描画の仮ドット絵で代替する。
import { TILE, CELL } from './config.js';

const images = new Map();
let manifest = { sprites: {}, tilesets: {}, objects: {}, items: {} };
const fallbackCache = new Map();

function loadImage(src) {
  if (images.has(src)) return images.get(src);
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed: ' + src));
    img.src = src;
  });
  images.set(src, p);
  return p;
}

export async function loadAssets() {
  try {
    const res = await fetch('assets/manifest.json', { cache: 'no-store' });
    if (res.ok) manifest = { sprites: {}, tilesets: {}, objects: {}, items: {}, ...(await res.json()) };
  } catch (e) {
    console.warn('manifest not found, using fallbacks', e);
  }
  const files = new Set();
  for (const group of Object.values(manifest)) {
    if (typeof group !== 'object') continue;
    for (const v of Object.values(group)) if (v && v.file) files.add(v.file);
  }
  const loaded = {};
  await Promise.all([...files].map(async f => {
    try { loaded[f] = await loadImage(f); } catch (e) { console.warn(e.message); }
  }));
  for (const group of ['sprites', 'tilesets', 'objects', 'items']) {
    for (const v of Object.values(manifest[group])) v.img = loaded[v.file] || null;
  }
  return manifest;
}

// ---- 文字列ドット絵 → canvas ----------------------------------------------
export function pixelArt(rows, palette, scale = 1) {
  const h = rows.length, w = rows[0].length;
  const c = document.createElement('canvas');
  c.width = w * scale; c.height = h * scale;
  const ctx = c.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = rows[y][x];
    if (ch === '.' || ch === ' ') continue;
    ctx.fillStyle = palette[ch] || '#f0f';
    ctx.fillRect(x * scale, y * scale, scale, scale);
  }
  return c;
}

// 仮モンスター: 色付きの丸っこいシルエット + 目
function fallbackSprite(id, color = '#a0a0a0') {
  const key = 'spr:' + id;
  if (fallbackCache.has(key)) return fallbackCache.get(key);
  const c = document.createElement('canvas');
  c.width = CELL; c.height = CELL * 4;
  const ctx = c.getContext('2d');
  for (let r = 0; r < 4; r++) {
    const oy = r * CELL;
    ctx.fillStyle = '#101010';
    ctx.fillRect(12, oy + 16, 24, 28);
    ctx.fillStyle = color;
    ctx.fillRect(14, oy + 18, 20, 24);
    ctx.fillRect(12, oy + 22, 24, 16);
    ctx.fillStyle = '#fff';
    if (r !== 3) { ctx.fillRect(18, oy + 26, 4, 4); ctx.fillRect(26, oy + 26, 4, 4); }
    ctx.fillStyle = '#000';
    if (r === 0) { ctx.fillRect(19, oy + 27, 2, 2); ctx.fillRect(27, oy + 27, 2, 2); }
    if (r === 1) { ctx.fillRect(18, oy + 27, 2, 2); ctx.fillRect(26, oy + 27, 2, 2); }
    if (r === 2) { ctx.fillRect(20, oy + 27, 2, 2); ctx.fillRect(28, oy + 27, 2, 2); }
  }
  const spr = { img: c, cell: CELL, frames: 1, bounce: true, fallback: true };
  fallbackCache.set(key, spr);
  return spr;
}

export function getSprite(id, color) {
  const s = manifest.sprites[id];
  if (s && s.img) return s;
  return fallbackSprite(id, color);
}

// ---- タイル ------------------------------------------------------------------
const TILE_PAL = { a: '#4a3222', b: '#5a3e2b', c: '#3c2818', s: '#6c7684', t: '#8a94a2', u: '#4c5460', k: '#2a2e36', l: '#a3acb8' };
const FLOOR_ROWS = [
  'aaaaaaaabaaaaaaa', 'abaaaaaaaaaaabaa', 'aaaaacaaaaaaaaaa', 'aaaaaaaaaaaaaaaa',
  'aaaaaaaaaaacaaaa', 'acaaaaaaaaaaaaaa', 'aaaaaaabaaaaaaaa', 'aaaaaaaaaaaaaaba',
  'aabaaaaaaaaaaaaa', 'aaaaaaaaacaaaaaa', 'aaaaaaaaaaaaaaaa', 'aaaacaaaaaaabaaa',
  'aaaaaaaaaaaaaaaa', 'abaaaaaabaaaaaaa', 'aaaaaaaaaaaaacaa', 'aaaaaaaaaaaaaaaa',
];
const WALL_ROWS = [
  'ttttttttkttttttt', 'ssssssssksssssss', 'ssssssssksssssss', 'kkkkkkkkkkkkkkkk',
  'ttttkttttttttttt', 'sssskssssssssss', 'sssskssssssssss', 'kkkkkkkkkkkkkkkk',
  'ttttttttttkttttt', 'sssssssssskssss', 'sssssssssskssss', 'kkkkkkkkkkkkkkkk',
  'tttkttttttttttt', 'ssskssssssssss', 'ssskssssssssss', 'kkkkkkkkkkkkkkkk',
];
function fallbackTile(name) {
  const key = 'tile:' + name;
  if (fallbackCache.has(key)) return fallbackCache.get(key);
  let c;
  if (name.startsWith('floor')) c = pixelArt(FLOOR_ROWS, TILE_PAL, 2);
  else c = pixelArt(WALL_ROWS.map(r => r.padEnd(16, 's')), TILE_PAL, 2);
  const t = { img: c, sx: 0, sy: 0, size: TILE };
  fallbackCache.set(key, t);
  return t;
}

let tilesetId = 'dungeon_tiles';
export function setTileset(id) { tilesetId = manifest.tilesets[id] ? id : 'dungeon_tiles'; }
export function getTile(name) {
  const ts = manifest.tilesets[tilesetId];
  if (ts && ts.img) {
    const i = ts.names.indexOf(name);
    if (i >= 0) return { img: ts.img, sx: i * ts.tile, sy: 0, size: ts.tile };
  }
  return fallbackTile(name);
}

// ---- オブジェクト（階段・罠） -----------------------------------------------
const OBJ_PAL = { g: '#8f8f8f', d: '#4a4a4a', k: '#111', w: '#d8d8d8', r: '#b02020', y: '#e0c040' };
const STAIRS_DOWN = [
  '................', '.kkkkkkkkkkkkkk.', '.kggggggggggggk.', '.kgkkkkkkkkkkgk.',
  '.kgkddddddddkgk.', '.kgkdkkkkkkdkgk.', '.kgkdkkkkkkdkgk.', '.kgkdkkkkkkdkgk.',
  '.kgkdkkkkkkdkgk.', '.kgkdkkkkkkdkgk.', '.kgkddddddddkgk.', '.kgkkkkkkkkkkgk.',
  '.kggggggggggggk.', '.kkkkkkkkkkkkkk.', '................', '................',
];
const STAIRS_UP = [
  '................', '.kkkkkkkkkkkkkk.', '.kwwwwwwwwwwwwk.', '.kwkkkkkkkkkkwk.',
  '.kwkggggggggkwk.', '.kwkgwwwwwwgkwk.', '.kwkgwkkkkwgkwk.', '.kwkgwkwwkwgkwk.',
  '.kwkgwkwwkwgkwk.', '.kwkgwkkkkwgkwk.', '.kwkgwwwwwwgkwk.', '.kwkggggggggkwk.',
  '.kwwwwwwwwwwwwk.', '.kkkkkkkkkkkkkk.', '................', '................',
];
const TRAP = [
  '................', '................', '.....kkkkkk.....', '....kddddddk....',
  '...kdkkkkkkdk...', '...kdkrrrrkdk...', '...kdkrkkrkdk...', '...kdkrkkrkdk...',
  '...kdkrrrrkdk...', '...kdkkkkkkdk...', '....kddddddk....', '.....kkkkkk.....',
  '................', '................', '................', '................',
];
export function getObject(id) {
  const o = manifest.objects[id];
  if (o && o.img) return { img: o.img, sx: 0, sy: 0, size: o.size };
  const key = 'obj:' + id;
  if (!fallbackCache.has(key)) {
    const rows = id === 'stairs_up' ? STAIRS_UP : id === 'trap' ? TRAP : STAIRS_DOWN;
    fallbackCache.set(key, { img: pixelArt(rows, OBJ_PAL, 2), sx: 0, sy: 0, size: TILE });
  }
  return fallbackCache.get(key);
}

// ---- アイテムアイコン ----------------------------------------------------------
const ITEM_PAL = { k: '#111', w: '#e8e8e8', g: '#40b040', d: '#207020', b: '#c08040', y: '#f0d040', s: '#a0a8b8', r: '#d03030', p: '#9040c0', c: '#40a0e0', o: '#e08030', t: '#804020' };
const ICONS = {
  weapon: [
    '................', '..........kk....', '.........kwwk...', '........kwwwk...',
    '.......kwwwk....', '......kwwwk.....', '.....kwwwk......', '....kwwwk.......',
    '..kkkwwwk.......', '..kykkwk........', '..kyykk.........', '..kyyyk.........',
    '.kttkyyk........', '.kttk.kk........', '..kk............', '................',
  ],
  shield: [
    '................', '...kkkkkkkkkk...', '..kssssssssssk..', '..ksrrrrrrrrsk..',
    '..ksrssssssrsk..', '..ksrsyyyysrsk..', '..ksrsyyyysrsk..', '..ksrssssssrsk..',
    '..ksrrrrrrrrsk..', '...kssssssssk...', '....kssssssk....', '.....kssssk.....',
    '......kssk......', '.......kk.......', '................', '................',
  ],
  herb: [
    '................', '......kk........', '.....kggk..kk...', '....kgddgkkggk..',
    '....kgdddgggdk..', '.....kgddgddk...', '......kgggdk....', '.......kgdk.....',
    '.......kgk......', '......kgdk......', '......kgk.......', '.....kgdk.......',
    '.....ktk........', '....ktk.........', '................', '................',
  ],
  food: [
    '................', '................', '....kkkkkkkk....', '...kboooooobk...',
    '..kbooyyyyoobk..', '..kboyyyyyyobk..', '..kboyyyyyyobk..', '..kbooyyyyoobk..',
    '..kbbooooooobk..', '...kbbbbbbbbk...', '....kkkkkkkk....', '................',
    '................', '................', '................', '................',
  ],
  scroll: [
    '................', '...kkkkkkkkkk...', '..kwwwwwwwwwwk..', '..kwkkkkkkkkwk..',
    '..kwwwwwwwwwwk..', '..kwkkkkkkkkwk..', '..kwwwwwwwwwwk..', '..kwkkkkkkkkwk..',
    '..kwwwwwwwwwwk..', '..kwkkkkkkkkwk..', '..kwwwwwwwwwwk..', '..krrrrrrrrrrk..',
    '...kkkkkkkkkk...', '................', '................', '................',
  ],
  seed: [
    '................', '................', '.......kk.......', '......kddk......',
    '.....kdrrdk.....', '....kdrrrrdk....', '....krrrrrrk....', '....krrrrrrk....',
    '....krryrrrk....', '.....krrrrk.....', '......krrk......', '.......kk.......',
    '................', '................', '................', '................',
  ],
  potion: [
    '................', '......kkkk......', '......kwwk......', '......kwwk......',
    '.....kwccwk.....', '....kwccccwk....', '....kcccccck....', '....kcccccck....',
    '....kcccccck....', '....kcccccck....', '.....kccccbk....', '......kkkk......',
    '................', '................', '................', '................',
  ],
  arrow: [
    '................', '.............kk.', '............kwwk', '...........kwwk.',
    '..........kwwk..', '.........kwwk...', '........kwwk....', '.......kwwk.....',
    '......kwwk......', '.....kwwk.......', '....kwwk........', '...kbbk.........',
    '..kbbk..........', '.kbbk...........', '.kkk............', '................',
  ],
  key: [
    '................', '.....kkkkk......', '....kyyyyyk.....', '...kyykkkyyk....',
    '...kyk...kyk....', '...kyk...kyk....', '...kyykkkyyk....', '....kyyyyyk.....',
    '.....kkyyk......', '......kyyk......', '......kyyk......', '......kyyyk.....',
    '......kyyk......', '......kyyyk.....', '.......kkk......', '................',
  ],
};
// 特定アイテム専用の仮アイコン
const ICONS_BY_ID = {
  // キラーピアス: 金のフープに三日月形の刃、赤い宝石
  i_killer_pierce: [
    '................', '.......ww.......', '......wyyw......', '......wyyw......',
    '.......kk.......', '.....kkyykk.....', '....kyykkyyk....', '...kyyk..kyyk...',
    '...kyk....kyk...', '...kyk...kyyk...', '...kyyk.kyyk....', '....kyyyyyk.....',
    '.....kkrkk......', '......krrk......', '......krrk......', '.......kk.......',
  ],
};
export function getItemIcon(iconId, kind) {
  const it = manifest.items[iconId];
  if (it && it.img) return { img: it.img, sx: it.x, sy: it.y, size: it.size };
  const key = ICONS_BY_ID[iconId] ? 'icon:' + iconId : 'icon:' + kind;
  if (!fallbackCache.has(key)) {
    fallbackCache.set(key, { img: pixelArt(ICONS_BY_ID[iconId] || ICONS[kind] || ICONS.key, ITEM_PAL, 2), sx: 0, sy: 0, size: TILE });
  }
  return fallbackCache.get(key);
}
