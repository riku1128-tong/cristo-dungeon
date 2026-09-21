// 敵の行動
import { DIRS, DIR8, dirFromDelta } from '../config.js';
import { canStep } from '../dungeon.js';
import { monsterHitPlayer, damagePlayer } from './combat.js';
import { ITEMS } from '../data/items.js';

const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export function monsterAct(game, m) {
  const p = game.player;
  const rng = game.rng;
  if (m.asleep) {
    // 隣で暴れると起きることがある
    if (cheb(m, p) <= 1 && rng.chance(0.2)) { m.asleep = false; game.log(`${m.name}は目を覚ました。`); }
    return;
  }
  if (m.status.sleep > 0) return;
  if (m.status.confusion > 0) { randomStep(game, m); return; }

  const sameRoom = game.map.room(m.x, m.y) >= 0 && game.map.room(m.x, m.y) === game.map.room(p.x, p.y);
  const near = cheb(m, p) <= 2;
  if (sameRoom || near) { m.seenPlayer = true; m.target = { x: p.x, y: p.y }; }

  if (m.def.flee) {
    if (sameRoom || near) stepAway(game, m);
    else randomStep(game, m);
    return;
  }

  // 隣接していれば攻撃(角抜け不可)
  const dx = p.x - m.x, dy = p.y - m.y;
  if (cheb(m, p) === 1 && canStep(game.map, m.x, m.y, dx, dy)) {
    m.dir = dirFromDelta(dx, dy);
    const sk = m.def.skill;
    if (sk && sk.type === 'spell_sleep' && !m.status.mahotone && rng.chance(sk.chance)) {
      castOnPlayer(game, m, sk);
      return;
    }
    monsterHitPlayer(game, m);
    return;
  }
  // 部屋内からの呪文
  const sk = m.def.skill;
  if (sk && sk.type === 'spell_damage' && sameRoom && !m.status.mahotone && rng.chance(sk.chance)) {
    m.dir = dirFromDelta(dx, dy);
    castOnPlayer(game, m, sk);
    return;
  }
  if (m.target) {
    if (!stepToward(game, m, m.target)) randomStep(game, m);
    if (m.x === m.target.x && m.y === m.target.y && !(sameRoom || near)) m.target = null;
    return;
  }
  wander(game, m);
}

function castOnPlayer(game, m, sk) {
  const p = game.player;
  const shield = p.shield ? ITEMS[p.shield.id] : null;
  game.log(`${m.name}は${sk.name}を唱えた！`);
  if (shield && shield.passive === 'mirror') { game.log('ミラーシールドが呪文をはね返した！'); return; }
  if (sk.type === 'spell_sleep') {
    if (p.status.sleep > 0) return;
    p.status.sleep = game.rng.int(sk.turns[0], sk.turns[1]);
    game.log('クリフトは眠ってしまった！');
  } else if (sk.type === 'spell_damage') {
    const dmg = game.rng.int(sk.dmg[0], sk.dmg[1]);
    game.log(`クリフトは${dmg}のダメージを受けた。`);
    damagePlayer(game, dmg, m.name);
  }
}

function occupied(game, x, y) {
  if (game.player.x === x && game.player.y === y) return true;
  return game.monsters.some(o => o.x === x && o.y === y);
}

function tryMove(game, m, dx, dy) {
  if (!canStep(game.map, m.x, m.y, dx, dy)) return false;
  if (occupied(game, m.x + dx, m.y + dy)) return false;
  game.moveEntity(m, m.x + dx, m.y + dy);
  m.dir = dirFromDelta(dx, dy);
  return true;
}

function stepToward(game, m, t) {
  const cands = DIR8.map(k => DIRS[k])
    .map(d => ({ d, dist: Math.hypot(t.x - (m.x + d.dx), t.y - (m.y + d.dy)) }))
    .sort((a, b) => a.dist - b.dist);
  const cur = Math.hypot(t.x - m.x, t.y - m.y);
  for (const c of cands) {
    if (c.dist >= cur) break;
    if (tryMove(game, m, c.d.dx, c.d.dy)) return true;
  }
  return false;
}

function stepAway(game, m) {
  const p = game.player;
  const cands = DIR8.map(k => DIRS[k])
    .map(d => ({ d, dist: Math.hypot(p.x - (m.x + d.dx), p.y - (m.y + d.dy)) }))
    .sort((a, b) => b.dist - a.dist);
  for (const c of cands) if (tryMove(game, m, c.d.dx, c.d.dy)) return true;
  return false;
}

function randomStep(game, m) {
  const dirs = game.rng.shuffle([...DIR8]);
  for (const k of dirs) { const d = DIRS[k]; if (tryMove(game, m, d.dx, d.dy)) return true; }
  return false;
}

// 通路は向きを保って進み、部屋では出口へ向かう
function wander(game, m) {
  const map = game.map;
  const room = map.roomAt(m.x, m.y);
  if (room && !room.node) {
    if (!m.wanderTarget || (m.wanderTarget.x === m.x && m.wanderTarget.y === m.y)) {
      // 部屋の縁にある出口(通路タイル)を探す
      const exits = [];
      for (let x = room.x - 1; x <= room.x + room.w; x++) for (const y of [room.y - 1, room.y + room.h]) if (map.isFloor(x, y)) exits.push({ x, y });
      for (let y = room.y - 1; y <= room.y + room.h; y++) for (const x of [room.x - 1, room.x + room.w]) if (map.isFloor(x, y)) exits.push({ x, y });
      m.wanderTarget = exits.length ? game.rng.pick(exits) : null;
    }
    if (m.wanderTarget && stepToward(game, m, m.wanderTarget)) return;
    m.wanderTarget = null;
    randomStep(game, m);
    return;
  }
  m.wanderTarget = null;
  // 通路: 現在の向きを優先し、戻る方向は最後
  const cur = DIRS[m.dir] || DIRS.down;
  const order = ['up', 'down', 'left', 'right'].filter(k => k !== m.dir && !(DIRS[k].dx === -cur.dx && DIRS[k].dy === -cur.dy));
  game.rng.shuffle(order);
  for (const k of [m.dir, ...order]) { const d = DIRS[k]; if (d && tryMove(game, m, d.dx, d.dy)) return; }
  const back = dirFromDelta(-cur.dx, -cur.dy);
  tryMove(game, m, DIRS[back].dx, DIRS[back].dy);
}
