// 道具の使用・装備・投げる・置く、武器の「つかう」効果
import { DIRS, INV_MAX } from '../config.js';
import { ITEMS } from '../data/items.js';
import { damageMonster, playerAtk, calcDamage } from './combat.js';
import { canStep } from '../dungeon.js';

function removeOne(game, item) {
  const inv = game.player.inventory;
  if (item.count != null && item.count > 1) { item.count--; return; }
  const i = inv.indexOf(item);
  if (i >= 0) inv.splice(i, 1);
}

// 戻り値: ターン消費したか
export function useItem(game, item) {
  const p = game.player;
  const def = ITEMS[item.id];
  if (def.kind === 'weapon') return useWeapon(game, item);
  if (def.kind === 'shield' || def.kind === 'key') { game.log('それは使えない。'); return false; }
  if (def.kind === 'arrow') { game.log('矢はクロスボウで撃つか、投げて使う。'); return false; }
  game.log(`${def.name}を${def.kind === 'scroll' ? '読んだ' : '使った'}。`);
  switch (def.effect) {
    case 'heal': {
      if (p.hp >= p.maxHp) { p.maxHp += def.amount >= 80 ? 2 : 1; p.hp = p.maxHp; game.log(`最大HPが上がった！`); }
      else { const h = Math.min(def.amount, p.maxHp - p.hp); p.hp += h; game.log(`HPが${h}回復した。`); }
      p.hunger = Math.min(p.maxHunger, p.hunger + 5);
      break;
    }
    case 'cure_poison':
      if (p.status.poison > 0) { delete p.status.poison; game.log('毒が治った。'); } else { p.hp = Math.min(p.maxHp, p.hp + 5); game.log('少しHPが回復した。'); }
      break;
    case 'food': {
      if (p.hunger >= p.maxHunger) { p.maxHunger += 5; p.hunger = p.maxHunger; game.log('満腹度の最大値が上がった！'); }
      else { p.hunger = Math.min(p.maxHunger, p.hunger + def.amount); game.log('おなかがふくれた。'); }
      break;
    }
    case 'str_up': p.str += 1; game.log('力が1上がった！'); break;
    case 'maxhp_up': p.maxHp += 5; p.hp += 5; game.log('最大HPが5上がった！'); break;
    case 'mp': { const m = Math.min(def.amount, p.maxMp - p.mp); p.mp += m; game.log(`MPが${m}回復した。`); break; }
    case 'remira': game.map.explored.fill(1); game.log('フロアの地形が頭に浮かんだ！'); break;
    case 'basilura': {
      const targets = monstersInRoom(game);
      if (!targets.length) game.log('しかし何も起こらなかった。');
      for (const m of targets) {
        const spot = game.map.randomFloor(game.rng, (x, y) => !game.isVisible(x, y) && !game.monsterAt(x, y));
        if (spot) { m.x = spot.x; m.y = spot.y; m.vx = spot.x; m.vy = spot.y; m.target = null; }
        game.log(`${m.name}は吹き飛ばされた！`);
      }
      break;
    }
    case 'sleep_room': {
      const targets = monstersInRoom(game);
      if (!targets.length) game.log('しかし何も起こらなかった。');
      for (const m of targets) { m.status.sleep = game.rng.int(5, 8); m.asleep = false; game.log(`${m.name}は眠ってしまった。`); }
      break;
    }
  }
  removeOne(game, item);
  game.endPlayerTurn();
  return true;
}

export function monstersInRoom(game) {
  const p = game.player;
  const rid = game.map.room(p.x, p.y);
  return game.monsters.filter(m => {
    if (rid >= 0) return game.map.room(m.x, m.y) === rid || (Math.abs(m.x - p.x) <= 1 && Math.abs(m.y - p.y) <= 1);
    return Math.abs(m.x - p.x) <= 1 && Math.abs(m.y - p.y) <= 1;
  });
}

function frontMonster(game, range = 1) {
  const p = game.player, d = DIRS[p.dir];
  for (let r = 1; r <= range; r++) {
    const x = p.x + d.dx * r, y = p.y + d.dy * r;
    if (!game.map.isFloor(x, y)) return null;
    const m = game.monsterAt(x, y);
    if (m) return m;
  }
  return null;
}

// 武器の「つかう」
function useWeapon(game, item) {
  const p = game.player;
  const def = ITEMS[item.id];
  if (!def.use) { game.log('その武器に特別な効果はない。'); return false; }
  const { mp, effect } = def.use;
  if (effect === 'shoot') return shootArrow(game, item);
  if (p.mp < mp) { game.log('MPが足りない！'); return false; }
  p.mp -= mp;
  p.anim.bump = { dir: p.dir, t0: performance.now() };
  switch (effect) {
    case 'hoimi': {
      game.log('祝福の杖をかざした。ホイミ！');
      const h = Math.min(25, p.maxHp - p.hp); p.hp += h; game.log(`HPが${h}回復した。`);
      break;
    }
    case 'sleep': {
      game.log('微笑みの杖を振った！');
      const m = frontMonster(game);
      if (!m) game.log('しかし何も起こらなかった。');
      else if (game.rng.chance(0.5)) { m.status.sleep = game.rng.int(4, 7); game.log(`${m.name}は眠ってしまった。`); }
      else game.log(`${m.name}には効かなかった。`);
      break;
    }
    case 'bagima': {
      game.log('天罰の杖を振った！ バギマ！');
      const d = DIRS[p.dir];
      const cells = threeFront(p, d);
      let hit = 0;
      for (const [x, y] of cells) {
        const m = game.monsterAt(x, y);
        if (m) { hit++; damageMonster(game, m, game.rng.int(15, 25), `${m.name}は真空の刃に切り裂かれた！`); }
      }
      if (!hit) game.log('しかし何も起こらなかった。');
      break;
    }
    case 'mahotone': {
      game.log('魔封じの杖を振った！ マホトーン！');
      const m = frontMonster(game);
      if (!m) game.log('しかし何も起こらなかった。');
      else if (m.def.skill) { m.status.mahotone = 30; game.log(`${m.name}の特技を封じ込めた！`); }
      else game.log(`${m.name}に特技はないようだ。`);
      break;
    }
    case 'io': {
      game.log('マグマの杖を振った！ イオ！');
      const targets = monstersInRoom(game);
      if (!targets.length) game.log('しかし何も起こらなかった。');
      for (const m of targets) damageMonster(game, m, game.rng.int(30, 45), `${m.name}は爆発に包まれた！`);
      break;
    }
  }
  game.endPlayerTurn();
  return true;
}

function threeFront(p, d) {
  if (d.dx !== 0 && d.dy !== 0) {
    return [[p.x + d.dx, p.y + d.dy], [p.x + d.dx, p.y], [p.x, p.y + d.dy]];
  }
  const px = d.dy !== 0 ? 1 : 0, py = d.dx !== 0 ? 1 : 0; // 進行方向に垂直
  return [[p.x + d.dx, p.y + d.dy], [p.x + d.dx + px, p.y + d.dy + py], [p.x + d.dx - px, p.y + d.dy - py]];
}

function shootArrow(game, weapon) {
  const p = game.player;
  const arrows = p.inventory.find(i => i.id === 'i_arrows');
  if (!arrows) { game.log('矢がない！'); return false; }
  if (p.weapon !== weapon) { game.log('クロスボウを装備していないと撃てない。'); return false; }
  removeOne(game, arrows);
  p.anim.bump = { dir: p.dir, t0: performance.now() };
  game.log('クロスボウで矢を放った！');
  projectile(game, p.dir, 10, (m) => {
    const dmg = calcDamage(game.rng, playerAtk(p) + 4, m.def.def);
    damageMonster(game, m, m.def.metal ? 1 : dmg, `矢が${m.name}に命中！ ${dmg}のダメージ。`);
  }, 'i_arrows');
  game.endPlayerTurn();
  return true;
}

// 直線に飛ぶ。敵に当たれば onHit、外れれば落下地点にアイテムを落とす
export function projectile(game, dirKey, range, onHit, dropId) {
  const p = game.player, d = DIRS[dirKey];
  let x = p.x, y = p.y;
  for (let r = 0; r < range; r++) {
    const nx = x + d.dx, ny = y + d.dy;
    if (!game.map.isFloor(nx, ny)) break;
    x = nx; y = ny;
    const m = game.monsterAt(x, y);
    if (m) { game.effects && game.effects.push({ type: 'shot', x, y }); onHit(m); return true; }
  }
  if (dropId && !(x === p.x && y === p.y) && !game.itemAt(x, y)) {
    game.items.push({ item: { id: dropId, kind: ITEMS[dropId].kind, name: ITEMS[dropId].name, count: 1 }, x, y });
  }
  return false;
}

export function throwItem(game, item) {
  const p = game.player;
  const def = ITEMS[item.id];
  const single = item.count != null ? { ...item, count: 1 } : item;
  removeOne(game, item);
  p.anim.bump = { dir: p.dir, t0: performance.now() };
  game.log(`${def.name}を投げた！`);
  const hit = projectile(game, p.dir, 10, (m) => {
    const base = def.kind === 'weapon' ? def.atk + 4 : def.kind === 'arrow' ? 8 : 3;
    const dmg = m.def.metal ? 1 : calcDamage(game.rng, p.str + base, m.def.def);
    damageMonster(game, m, dmg, `${def.name}が${m.name}に命中！ ${dmg}のダメージ。`);
  }, null);
  if (!hit) {
    // 落下
    const d = DIRS[p.dir];
    let x = p.x, y = p.y;
    for (let r = 0; r < 10; r++) { if (!game.map.isFloor(x + d.dx, y + d.dy)) break; x += d.dx; y += d.dy; }
    while ((x !== p.x || y !== p.y) && game.itemAt(x, y)) { x -= d.dx; y -= d.dy; }
    if (x !== p.x || y !== p.y) game.items.push({ item: single, x, y });
  }
  game.endPlayerTurn();
  return true;
}

export function dropItem(game, item) {
  const p = game.player;
  if (game.itemAt(p.x, p.y)) { game.log('ここには置けない。'); return false; }
  if (p.weapon === item) p.weapon = null;
  if (p.shield === item) p.shield = null;
  p.inventory.splice(p.inventory.indexOf(item), 1);
  game.items.push({ item, x: p.x, y: p.y });
  game.log(`${item.name}を置いた。`);
  game.endPlayerTurn();
  return true;
}

export function equipItem(game, item) {
  const p = game.player;
  const def = ITEMS[item.id];
  if (def.kind === 'weapon') {
    if (p.weapon === item) { p.weapon = null; game.log(`${def.name}をはずした。`); }
    else { p.weapon = item; game.log(`${def.name}を装備した。`); }
  } else if (def.kind === 'shield') {
    if (p.shield === item) { p.shield = null; game.log(`${def.name}をはずした。`); }
    else { p.shield = item; game.log(`${def.name}を装備した。`); }
  } else { game.log('それは装備できない。'); return false; }
  game.endPlayerTurn();
  return true;
}

// 足元のアイテムを拾う（乗ったときに拾えなかった場合）
export function pickUp(game) {
  const p = game.player;
  const it = game.itemAt(p.x, p.y);
  if (!it) { game.log('足元には何もない。'); return false; }
  if (p.inventory.length >= INV_MAX) { game.log('持ち物がいっぱいだ。'); return false; }
  game.items = game.items.filter(i => i !== it);
  game.addItem(it.item);
  game.log(`${it.item.name}を拾った。`);
  if (it.item.id === 'i_killer_pierce') game.obtainPierce();
  game.endPlayerTurn();
  return true;
}
