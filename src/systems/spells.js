// クリフトの呪文
import { DIRS } from '../config.js';
import { killMonster } from './combat.js';
import { monstersInRoom } from './inventory.js';

export function castSpell(game, spell) {
  const p = game.player;
  if (p.mp < spell.mp) { game.log('MPが足りない！'); return false; }
  p.mp -= spell.mp;
  p.anim.bump = { dir: p.dir, t0: performance.now() };
  game.log(`クリフトは${spell.name}を唱えた！`);
  switch (spell.id) {
    case 'hoimi': heal(game, 15); break;
    case 'behoimi': heal(game, 45); break;
    case 'sukara': p.status.sukara = 20; game.log('守備力が上がった！'); break;
    case 'baikiruto': p.status.baikiruto = 15; game.log('攻撃力が上がった！'); break;
    case 'zaki': {
      const d = DIRS[p.dir];
      const m = game.monsterAt(p.x + d.dx, p.y + d.dy);
      if (!m) game.log('しかし何も起こらなかった。');
      else if (m.def.metal || m.def.undead) game.log(`${m.name}には効かなかった。`);
      else if (game.rng.chance(0.5)) { game.log(`${m.name}の心臓が止まった！`); killMonster(game, m); }
      else game.log(`${m.name}は死をまぬがれた。`);
      break;
    }
    case 'zaraki': {
      const targets = monstersInRoom(game);
      if (!targets.length) game.log('しかし何も起こらなかった。');
      for (const m of targets) {
        if (m.def.metal || m.def.undead) { game.log(`${m.name}には効かなかった。`); continue; }
        if (game.rng.chance(0.4)) { game.log(`${m.name}の心臓が止まった！`); killMonster(game, m); }
        else game.log(`${m.name}は死をまぬがれた。`);
      }
      break;
    }
  }
  game.endPlayerTurn();
  return true;
}

function heal(game, n) {
  const p = game.player;
  const h = Math.min(n, p.maxHp - p.hp);
  p.hp += h;
  game.effect('heal', p.x, p.y);
  if (h > 0) game.popup(p.x, p.y, `+${h}`, '#8f8');
  game.log(h > 0 ? `HPが${h}回復した。` : 'HPは満タンだ。');
}
