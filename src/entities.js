import { START } from './data/levels.js';
import { MONSTERS } from './data/monsters.js';

export function makePlayer() {
  return {
    kind: 'player', name: 'クリフト',
    x: 0, y: 0, vx: 0, vy: 0, dir: 'down',
    lv: 1, exp: 0,
    hp: START.hp, maxHp: START.hp,
    mp: START.mp, maxMp: START.mp,
    str: START.str,
    hunger: START.hunger, maxHunger: START.hunger,
    inventory: [],
    weapon: null, shield: null,
    status: {},           // poison, sleep, confusion, sukara, baikiruto → 残りターン
    anim: { moveT0: 0, fromX: 0, fromY: 0, bump: null, hitT: 0, walking: false },
    turns: 0,
  };
}

export function makeMonster(id, x, y, rng) {
  const def = MONSTERS[id];
  return {
    kind: 'monster', id, def, name: def.name,
    x, y, vx: x, vy: y, dir: 'down',
    hp: def.hp, maxHp: def.hp,
    status: {},           // sleep, mahotone, confusion
    asleep: rng ? rng.chance(0.3) : false,   // 生成時に寝ている敵もいる
    seenPlayer: false,
    anim: { moveT0: 0, fromX: x, fromY: y, bump: null, hitT: 0, walking: false },
    uid: Math.floor(Math.random() * 1e9),
  };
}

export function makeFloorItem(item, x, y) {
  return { item, x, y };
}
