// ダメージ計算と攻撃処理
import { ITEMS } from '../data/items.js';

export function playerAtk(p) {
  let atk = p.str + (p.weapon ? ITEMS[p.weapon.id].atk : 0);
  if (p.shield && ITEMS[p.shield.id].passive === 'str3') atk += 3;
  if (p.status.baikiruto > 0) atk *= 2;
  return atk;
}

export function playerDef(p) {
  let def = p.shield ? ITEMS[p.shield.id].def : 0;
  if (p.status.sukara > 0) def = Math.floor(def * 1.5) + 2;
  return def;
}

export function calcDamage(rng, atk, def) {
  const base = atk - def / 2;
  const dmg = Math.round(base * rng.float(0.875, 1.125));
  return Math.max(1, dmg);
}

export function weaponPassive(p) {
  return p.weapon ? ITEMS[p.weapon.id].passive || null : null;
}

// プレイヤーの通常攻撃（対象は 1 体）。戻り値: 倒したか
export function playerHit(game, m, mult = 1) {
  const p = game.player;
  const rng = game.rng;
  const passive = weaponPassive(p);
  if (!rng.chance(0.9)) {
    game.log(`クリフトの攻撃！ しかし ${m.name}には当たらなかった。`);
    game.popup(m.x, m.y, 'MISS', '#ccc');
    return false;
  }
  let atk = playerAtk(p);
  let note = '';
  if (passive === 'mind' && p.mp >= 1) { p.mp -= 1; mult *= 1.5; note = '理力の杖が光る！ '; }
  let dmg = calcDamage(rng, atk, m.def.def);
  if ((passive === 'undead' || passive === 'range2_undead') && m.def.undead) { dmg = Math.floor(dmg * 1.5); note = '聖なる力がアンデッドを焼く！ '; }
  dmg = Math.max(1, Math.floor(dmg * mult));
  if (m.def.metal) dmg = rng.chance(0.5) ? 1 : (rng.chance(0.3) ? 2 : 0);
  if (passive === 'miracle') p.hp = Math.min(p.maxHp, p.hp + rng.int(1, 2));
  return damageMonster(game, m, dmg, `${note}クリフトの攻撃！ ${m.name}に${dmg}のダメージ。`);
}

export function damageMonster(game, m, dmg, msg) {
  m.hp -= dmg;
  m.anim.hitT = performance.now();
  if (m.asleep && game.rng.chance(0.7)) m.asleep = false;
  if (msg) game.log(msg);
  game.popup(m.x, m.y, String(dmg), '#fff');
  if (m.hp <= 0) { killMonster(game, m); return true; }
  return false;
}

export function killMonster(game, m) {
  const p = game.player;
  game.monsters = game.monsters.filter(o => o !== m);
  game.kills = (game.kills || 0) + 1;
  game.log(`${m.name}をやっつけた！`);
  game.gainExp(m.def.exp);
}

export function monsterHitPlayer(game, m) {
  const p = game.player;
  const rng = game.rng;
  m.anim.bump = { dir: m.dir, t0: performance.now() };
  if (!rng.chance(0.85)) {
    game.log(`${m.name}の攻撃！ しかしクリフトはひらりと身をかわした。`);
    game.popup(p.x, p.y, 'MISS', '#ccc');
    return;
  }
  const dmg = calcDamage(rng, m.def.atk, playerDef(p));
  game.log(`${m.name}の攻撃！ クリフトは${dmg}のダメージを受けた。`);
  damagePlayer(game, dmg);
  // 毒攻撃
  const sk = m.def.skill;
  if (p.hp > 0 && sk && sk.type === 'melee_poison' && !m.status.mahotone && rng.chance(sk.chance)) {
    game.applyPoison(m.name);
  }
}

export function damagePlayer(game, dmg, cause) {
  const p = game.player;
  p.hp -= dmg;
  p.anim.hitT = performance.now();
  game.popup(p.x, p.y, String(dmg), '#f66');
  if (p.hp <= 0) { p.hp = 0; game.gameOver(cause); }
}
