// ゲーム状態とターン進行
import { DIRS, MAX_FLOOR, INV_MAX, dirFromDelta } from './config.js';
import { RNG } from './rng.js';
import { generateFloor, canStep } from './dungeon.js';
import { computeVisible } from './fov.js';
import { makePlayer, makeMonster, makeFloorItem } from './entities.js';
import { monstersForFloor } from './data/monsters.js';
import { itemsForFloor, makeItem, ITEMS } from './data/items.js';
import { EXP_TABLE, MAX_LV, growth } from './data/levels.js';
import { SPELLS } from './data/spells.js';
import { playerHit, damagePlayer } from './systems/combat.js';
import { monsterAct } from './systems/ai.js';
import { setTileset } from './assets.js';

export class Game {
  constructor(seed) {
    this.seed = seed;
    this.rng = new RNG(seed);
    this.state = 'title';       // title | play | dead | clear
    this.messages = [];         // {text, turn}
    this.popups = [];           // {x,y,text,color,t0}
    this.effects = [];          // {type,x,y,t0} 回復などの演出
    this.onEvent = () => {};    // UI へ通知 (levelup など)
  }

  // ---- 開始・フロア ------------------------------------------------------
  newGame() {
    this.player = makePlayer();
    this.floor = 0;
    this.returning = false;     // キラーピアス入手後の帰り道
    this.hasPierce = false;
    this.turn = 0;
    this.kills = 0;
    this.messages = [];
    this.state = 'play';
    this.enterFloor(1);
    this.log('クリフトはダンジョンに足を踏み入れた。');
    this.log('B10Fにあるキラーピアスを持ち帰るのだ！');
  }

  enterFloor(n) {
    this.floor = n;
    const goal = n === MAX_FLOOR && !this.hasPierce;
    this.map = generateFloor(this.rng, { stairsUp: this.returning || goal, noDeadEnds: n <= 5 });
    setTileset(n >= 6 ? 'dungeon_tiles_deep' : 'dungeon_tiles');
    this.monsters = [];
    this.items = [];
    this.traps = [];
    const p = this.player;
    const start = this.map.randomFloor(this.rng, (x, y) => this.map.room(x, y) >= 0 && !(x === this.map.stairs.x && y === this.map.stairs.y));
    p.x = start.x; p.y = start.y; p.vx = p.x; p.vy = p.y; p.dir = 'down';
    p.anim.moveT0 = 0;
    // 状態異常は階を移ると治る
    for (const k of ['poison', 'sleep', 'confusion']) delete p.status[k];
    this.populate(n, goal);
    this.updateVisible();
    this.log(`B${n}F ${this.returning ? '（帰り道）' : ''}`);
  }

  populate(n, goal) {
    const rng = this.rng;
    const free = (x, y) => this.map.isFloor(x, y) && !(x === this.player.x && y === this.player.y)
      && !this.monsters.some(m => m.x === x && m.y === y) && !this.items.some(i => i.x === x && i.y === y)
      && !(x === this.map.stairs.x && y === this.map.stairs.y);
    // 敵
    const table = monstersForFloor(n);
    const count = rng.int(4, 6);
    for (let i = 0; i < count; i++) {
      const spot = this.map.randomFloor(rng, (x, y) => free(x, y) && this.map.room(x, y) !== this.map.room(this.player.x, this.player.y));
      if (!spot) break;
      const def = rng.weighted(table);
      this.monsters.push(makeMonster(def.id, spot.x, spot.y, rng));
    }
    // アイテム
    const itable = itemsForFloor(n);
    const icount = rng.int(2, 4);
    for (let i = 0; i < icount; i++) {
      const spot = this.map.randomFloor(rng, (x, y) => free(x, y) && this.map.room(x, y) >= 0);
      if (!spot) break;
      const def = rng.weighted(itable);
      this.items.push(makeFloorItem(makeItem(def.id, rng), spot.x, spot.y));
    }
    if (goal) {
      const spot = this.map.randomFloor(rng, (x, y) => free(x, y) && this.map.room(x, y) >= 0);
      this.items.push(makeFloorItem(makeItem('i_killer_pierce'), spot.x, spot.y));
    }
    // 罠
    const tcount = rng.int(0, 3);
    for (let i = 0; i < tcount; i++) {
      const spot = this.map.randomFloor(rng, (x, y) => free(x, y) && this.map.room(x, y) >= 0 && !this.traps.some(t => t.x === x && t.y === y));
      if (spot) this.traps.push({ x: spot.x, y: spot.y, type: rng.pick(['poison_arrow', 'mine', 'sleep_gas']), found: false });
    }
  }

  // B1〜B5 は通路でも周囲 4 マスが見える(難易度緩和)。B6 以降はトルネコ通り周囲 1 マス
  updateVisible() { this.visible = computeVisible(this.map, this.player.x, this.player.y, this.floor <= 5 ? 4 : 1); }
  isVisible(x, y) { return this.map.inBounds(x, y) && this.visible[y * this.map.w + x] === 1; }

  // ---- ログ・演出 --------------------------------------------------------
  log(text) { this.messages.push({ text, turn: this.turn, t: performance.now() }); if (this.messages.length > 200) this.messages.shift(); }
  popup(x, y, text, color) { this.popups.push({ x, y, text, color, t0: performance.now() }); }
  effect(type, x, y) { this.effects.push({ type, x, y, t0: performance.now() }); }

  moveEntity(e, x, y) {
    e.anim.fromX = e.x; e.anim.fromY = e.y; e.anim.moveT0 = performance.now(); e.anim.walking = true;
    e.x = x; e.y = y;
  }

  monsterAt(x, y) { return this.monsters.find(m => m.x === x && m.y === y) || null; }
  itemAt(x, y) { return this.items.find(i => i.x === x && i.y === y) || null; }

  // ---- プレイヤー行動 (true を返せばターン消費) -----------------------------
  tryMove(dirKey) {
    const p = this.player;
    const d = DIRS[dirKey];
    p.dir = dirKey;
    if (p.status.confusion > 0) { const k = this.rng.pick(Object.keys(DIRS)); return this.tryMove(k === dirKey ? 'down' : k); }
    const nx = p.x + d.dx, ny = p.y + d.dy;
    if (!canStep(this.map, p.x, p.y, d.dx, d.dy)) return false;
    const m = this.monsterAt(nx, ny);
    if (m) { this.attack(); return true; }
    this.moveEntity(p, nx, ny);
    this.updateVisible();
    this.afterStep();
    this.endPlayerTurn();
    return true;
  }

  afterStep() {
    const p = this.player;
    const it = this.itemAt(p.x, p.y);
    if (it) {
      if (p.inventory.length >= INV_MAX) {
        this.log(`${it.item.name}の上に乗った。（持ち物がいっぱいだ）`);
      } else {
        this.items = this.items.filter(i => i !== it);
        this.addItem(it.item);
        this.log(`${it.item.name}を拾った。`);
        if (it.item.id === 'i_killer_pierce') this.obtainPierce();
      }
    }
    const trap = this.traps.find(t => t.x === p.x && t.y === p.y);
    if (trap) this.triggerTrap(trap);
    if (this.map.stairs.x === p.x && this.map.stairs.y === p.y) this.log(this.map.stairs.up ? '上り階段がある。' : '下り階段がある。');
  }

  addItem(item) {
    if (item.count != null) {
      const same = this.player.inventory.find(i => i.id === item.id);
      if (same) { same.count += item.count; return; }
    }
    this.player.inventory.push(item);
  }

  obtainPierce() {
    this.hasPierce = true;
    this.returning = true;
    this.log('キラーピアスを手に入れた！ 上り階段から地上へ戻ろう！');
    this.onEvent('pierce');
  }

  triggerTrap(trap) {
    const p = this.player;
    trap.found = true;
    if (trap.type === 'poison_arrow') {
      this.log('毒矢の罠だ！');
      damagePlayer(this, this.rng.int(3, 6), '毒矢の罠');
      if (p.hp > 0) this.applyPoison('罠');
    } else if (trap.type === 'mine') {
      this.log('地雷だ！ 爆発した！');
      damagePlayer(this, Math.max(5, Math.floor(p.hp / 3)), '地雷');
      for (const m of [...this.monsters]) if (Math.max(Math.abs(m.x - p.x), Math.abs(m.y - p.y)) <= 1) { m.hp = 0; this.monsters = this.monsters.filter(o => o !== m); this.log(`${m.name}は爆発に巻き込まれた！`); }
    } else if (trap.type === 'sleep_gas') {
      this.log('眠りガスの罠だ！ クリフトは眠ってしまった。');
      p.status.sleep = this.rng.int(3, 5);
    }
  }

  applyPoison(source) {
    const p = this.player;
    if (p.shield && ITEMS[p.shield.id].passive === 'poison_immune') { this.log('うろこの盾が毒を防いだ！'); return; }
    if (!(p.status.poison > 0)) this.log('クリフトは毒におかされた！');
    p.status.poison = Math.max(p.status.poison || 0, 10);
  }

  // 前方 1 マスを攻撃
  attack() {
    const p = this.player;
    const d = DIRS[p.dir];
    p.anim.bump = { dir: p.dir, t0: performance.now() };
    const x = p.x + d.dx, y = p.y + d.dy;
    const target = canStep(this.map, p.x, p.y, d.dx, d.dy) ? this.monsterAt(x, y) : null;
    if (target) playerHit(this, target);
    else this.log('クリフトは空を切った。');
    this.endPlayerTurn();
    return true;
  }

  rest() { this.endPlayerTurn(); return true; }

  useStairs() {
    const p = this.player;
    if (!(this.map.stairs.x === p.x && this.map.stairs.y === p.y)) { this.log('ここに階段はない。'); return false; }
    if (this.map.stairs.up) {
      if (this.floor === 1) { this.clear(); return true; }
      this.enterFloor(this.floor - 1);
    } else {
      this.enterFloor(this.floor + 1);
    }
    return true;
  }

  // ---- ターン終了処理 ------------------------------------------------------
  endPlayerTurn() {
    const p = this.player;
    this.turn++;
    p.turns++;
    // 敵の行動
    for (const m of [...this.monsters]) {
      if (this.state !== 'play') return;
      if (!this.monsters.includes(m)) continue;
      monsterAct(this, m);
    }
    if (this.state !== 'play') return;
    this.upkeep();
    this.updateVisible();
  }

  upkeep() {
    const p = this.player;
    const shield = p.shield ? ITEMS[p.shield.id] : null;
    // 満腹度
    const hungerEvery = shield && shield.passive === 'hunger_half' ? 20 : 10;
    if (this.turn % hungerEvery === 0) {
      if (p.hunger > 0) {
        p.hunger--;
        if (p.hunger === 20) this.log('おなかが減ってきた…');
        if (p.hunger === 0) this.log('おなかが減って動けない！ 何か食べないと！');
      }
    }
    if (p.hunger <= 0) damagePlayer(this, 1, '空腹');
    else if (this.turn % Math.max(2, Math.round(150 / p.maxHp)) === 0 && p.hp < p.maxHp && !(p.status.poison > 0)) p.hp++;
    // MP は自然回復しない（魔法の聖水・レベルアップのみ）
    // 状態異常
    if (p.status.poison > 0) { damagePlayer(this, 1, '毒'); if (--p.status.poison === 0) { delete p.status.poison; this.log('毒が抜けた。'); } }
    for (const k of ['sleep', 'confusion', 'sukara', 'baikiruto']) {
      if (p.status[k] > 0 && --p.status[k] === 0) {
        delete p.status[k];
        if (k === 'sleep') this.log('クリフトは目を覚ました。');
        if (k === 'confusion') this.log('混乱がとけた。');
        if (k === 'sukara') this.log('スカラの効果が切れた。');
        if (k === 'baikiruto') this.log('バイキルトの効果が切れた。');
      }
    }
    for (const m of this.monsters) {
      for (const k of ['sleep', 'confusion', 'mahotone']) if (m.status[k] > 0 && --m.status[k] === 0) delete m.status[k];
    }
    // 湧き
    if (this.turn % 40 === 0 && this.monsters.length < 10) {
      const table = monstersForFloor(this.floor);
      const spot = this.map.randomFloor(this.rng, (x, y) => !this.isVisible(x, y) && !this.monsterAt(x, y));
      if (spot) this.monsters.push(makeMonster(this.rng.weighted(table).id, spot.x, spot.y));
    }
  }

  gainExp(n) {
    const p = this.player;
    p.exp += n;
    this.log(`${n}の経験値を得た。`);
    while (p.lv < MAX_LV && p.exp >= EXP_TABLE[p.lv + 1]) {
      p.lv++;
      const g = growth(this.rng, p.lv);
      p.maxHp += g.hp; p.hp += g.hp; p.maxMp += g.mp; p.mp += g.mp; p.str += g.str;
      this.log(`レベルが${p.lv}に上がった！ HP+${g.hp} MP+${g.mp}${g.str ? ' 力+1' : ''}`);
      for (const s of SPELLS) if (s.lv === p.lv) this.log(`${s.name}を覚えた！`);
      this.onEvent('levelup');
    }
  }

  gameOver(cause) {
    if (this.state !== 'play') return;
    this.state = 'dead';
    this.log('クリフトは力尽きた…');
    this.onEvent('dead');
  }

  clear() {
    this.state = 'clear';
    this.log('地上に戻ってきた！ キラーピアスを持ち帰った！');
    this.onEvent('clear');
  }
}
