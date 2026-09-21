// フロア生成: 画面を 3x2 のセクションに分け、各セクションに部屋(または通路の交点)を置き、隣接セクションを通路で結ぶ
import { MAP_W, MAP_H } from './config.js';

export const WALL = 0;
export const FLOOR = 1;

export class DungeonMap {
  constructor(w = MAP_W, h = MAP_H) {
    this.w = w; this.h = h;
    this.tiles = new Uint8Array(w * h);      // WALL / FLOOR
    this.roomId = new Int16Array(w * h).fill(-1); // 部屋番号(-1 = 通路)
    this.rooms = [];                          // {x,y,w,h,id,node}
    this.explored = new Uint8Array(w * h);
    this.stairs = null;                       // {x,y,up:boolean}
  }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { return this.inBounds(x, y) ? this.tiles[y * this.w + x] : WALL; }
  isFloor(x, y) { return this.get(x, y) === FLOOR; }
  room(x, y) { return this.inBounds(x, y) ? this.roomId[y * this.w + x] : -1; }
  set(x, y, v) { if (this.inBounds(x, y)) this.tiles[y * this.w + x] = v; }
  // 部屋の内側(+1の縁=出入口)にいるか
  roomAt(x, y) {
    const id = this.room(x, y);
    return id >= 0 ? this.rooms[id] : null;
  }
  randomFloor(rng, pred = () => true) {
    for (let i = 0; i < 2000; i++) {
      const x = rng.int(1, this.w - 2), y = rng.int(1, this.h - 2);
      if (this.isFloor(x, y) && pred(x, y)) return { x, y };
    }
    return null;
  }
}

export function generateFloor(rng, opts = {}) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const map = tryGenerate(rng, opts);
    if (map) return map;
  }
  throw new Error('dungeon generation failed');
}

function tryGenerate(rng, opts) {
  const map = new DungeonMap();
  const COLS = 3, ROWS = 2;
  const sw = Math.floor(map.w / COLS), sh = Math.floor(map.h / ROWS);
  const cells = [];
  let roomCount = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const x0 = c * sw, y0 = r * sh;
    const node = rng.chance(0.18) && roomCount >= 2; // 通路の交点だけのセクション
    if (node) {
      const x = rng.int(x0 + 3, x0 + sw - 4), y = rng.int(y0 + 3, y0 + sh - 4);
      cells.push({ c, r, node: true, x, y, w: 1, h: 1 });
    } else {
      const w = rng.int(5, Math.min(11, sw - 5));
      const h = rng.int(4, Math.min(8, sh - 5));
      const x = rng.int(x0 + 2, x0 + sw - w - 2);
      const y = rng.int(y0 + 2, y0 + sh - h - 2);
      cells.push({ c, r, node: false, x, y, w, h });
      roomCount++;
    }
  }
  if (roomCount < 4) return null;
  // 部屋を彫る
  cells.forEach((cell, i) => {
    cell.id = i;
    if (cell.node) { map.set(cell.x, cell.y, FLOOR); return; }
    for (let y = cell.y; y < cell.y + cell.h; y++) for (let x = cell.x; x < cell.x + cell.w; x++) {
      map.set(x, y, FLOOR);
      map.roomId[y * map.w + x] = i;
    }
  });
  map.rooms = cells;
  // 隣接セクションを接続: 全域木 + 追加辺
  const edges = [];
  for (const a of cells) for (const b of cells) {
    if (a.id >= b.id) continue;
    if ((a.c === b.c && Math.abs(a.r - b.r) === 1) || (a.r === b.r && Math.abs(a.c - b.c) === 1)) edges.push([a, b]);
  }
  rng.shuffle(edges);
  const parent = cells.map((_, i) => i);
  const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const used = [];
  for (const [a, b] of edges) {
    if (find(a.id) !== find(b.id)) { parent[find(a.id)] = find(b.id); used.push([a, b]); }
  }
  for (const e of edges) if (!used.includes(e) && rng.chance(0.35)) used.push(e);
  for (const [a, b] of used) carveCorridor(map, rng, a, b);
  // 交点セクションの接続数が 1 だと行き止まりになる。それも味だが、孤立は避ける
  if (!connected(map)) return null;
  // 階段
  const stairsRoom = rng.pick(cells.filter(c => !c.node));
  map.stairs = { x: rng.int(stairsRoom.x, stairsRoom.x + stairsRoom.w - 1), y: rng.int(stairsRoom.y, stairsRoom.y + stairsRoom.h - 1), up: !!opts.stairsUp };
  return map;
}

// 部屋 a と b を L 字/ Z 字の通路で結ぶ。部屋の縁に出入口を作る
function carveCorridor(map, rng, a, b) {
  const horizontal = a.r === b.r;
  let p, q;
  if (horizontal) {
    const [l, r] = a.c < b.c ? [a, b] : [b, a];
    p = { x: l.x + l.w - 1, y: rng.int(l.y, l.y + l.h - 1) };
    q = { x: r.x, y: rng.int(r.y, r.y + r.h - 1) };
    if (!l.node) p.x += 1; if (!r.node) q.x -= 1;
    const midx = rng.int(Math.min(p.x, q.x), Math.max(p.x, q.x));
    line(map, p.x, p.y, midx, p.y); line(map, midx, p.y, midx, q.y); line(map, midx, q.y, q.x, q.y);
  } else {
    const [t, u] = a.r < b.r ? [a, b] : [b, a];
    p = { x: rng.int(t.x, t.x + t.w - 1), y: t.y + t.h - 1 };
    q = { x: rng.int(u.x, u.x + u.w - 1), y: u.y };
    if (!t.node) p.y += 1; if (!u.node) q.y -= 1;
    const midy = rng.int(Math.min(p.y, q.y), Math.max(p.y, q.y));
    line(map, p.x, p.y, p.x, midy); line(map, p.x, midy, q.x, midy); line(map, q.x, midy, q.x, q.y);
  }
}

function line(map, x0, y0, x1, y1) {
  const dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0);
  let x = x0, y = y0;
  for (;;) {
    if (x > 0 && y > 0 && x < map.w - 1 && y < map.h - 1 && map.get(x, y) === WALL) map.set(x, y, FLOOR);
    if (x === x1 && y === y1) break;
    if (x !== x1) x += dx; else y += dy;
  }
}

function connected(map) {
  let start = -1, total = 0;
  for (let i = 0; i < map.tiles.length; i++) if (map.tiles[i] === FLOOR) { total++; if (start < 0) start = i; }
  if (start < 0) return false;
  const seen = new Uint8Array(map.tiles.length);
  const stack = [start]; seen[start] = 1; let n = 0;
  while (stack.length) {
    const i = stack.pop(); n++;
    const x = i % map.w, y = (i / map.w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!map.inBounds(nx, ny)) continue;
      const j = ny * map.w + nx;
      if (!seen[j] && map.tiles[j] === FLOOR) { seen[j] = 1; stack.push(j); }
    }
  }
  return n === total;
}

// 斜め移動は角を曲がれない(トルネコ準拠): 両脇どちらかが壁なら不可
export function canStep(map, x, y, dx, dy) {
  if (!map.isFloor(x + dx, y + dy)) return false;
  if (dx !== 0 && dy !== 0 && (!map.isFloor(x + dx, y) || !map.isFloor(x, y + dy))) return false;
  return true;
}

// 壁のオートタイル名を決める（床に接していない壁は null = 描画しない）
export function wallTileName(map, x, y) {
  const f = (dx, dy) => map.isFloor(x + dx, y + dy);
  const n = f(0, -1), s = f(0, 1), w = f(-1, 0), e = f(1, 0);
  if (n && w && !s && !e) return 'wall_tl';
  if (n && e && !s && !w) return 'wall_tr';
  if (s && w && !n && !e) return 'wall_bl';
  if (s && e && !n && !w) return 'wall_br';
  if (n && !s && !w && !e) return 'wall_t';
  if (s && !n && !w && !e) return 'wall_b';
  if (w && !n && !s && !e) return 'wall_l';
  if (e && !n && !s && !w) return 'wall_r';
  if (n || s || w || e) return 'wall_c';
  const ne = f(1, -1), nw = f(-1, -1), se = f(1, 1), sw = f(-1, 1);
  if (se && !sw && !ne && !nw) return 'wall_in_se';
  if (sw && !se && !ne && !nw) return 'wall_in_sw';
  if (ne && !nw && !se && !sw) return 'wall_in_ne';
  if (nw && !ne && !se && !sw) return 'wall_in_nw';
  if (ne || nw || se || sw) return 'wall_c';
  return null;
}

// 目標地点からの BFS 距離(4近傍)。到達不能は -1
export function bfsDistances(map, tx, ty) {
  const dist = new Int16Array(map.w * map.h).fill(-1);
  const q = [ty * map.w + tx]; dist[q[0]] = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi], x = i % map.w, y = (i / map.w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!map.isFloor(nx, ny)) continue;
      const j = ny * map.w + nx;
      if (dist[j] < 0) { dist[j] = dist[i] + 1; q.push(j); }
    }
  }
  return dist;
}
