// メニュー(スタック式): メイン / どうぐ / 呪文 / 足元 / 階段 / ステータス
import { SCREEN_W, SCREEN_H, HUD_H, INV_MAX } from '../config.js';
import { ITEMS, itemLabel } from '../data/items.js';
import { spellsForLevel } from '../data/spells.js';
import { getItemIcon } from '../assets.js';
import { useItem, equipItem, throwItem, dropItem, pickUp } from '../systems/inventory.js';
import { castSpell } from '../systems/spells.js';
import { playerAtk, playerDef } from '../systems/combat.js';
import { drawMenu, drawWindow, text, LINE } from './window.js';
import { is } from './input.js';

export class MenuStack {
  constructor(game) { this.game = game; this.stack = []; }
  get open() { return this.stack.length > 0; }
  get top() { return this.stack[this.stack.length - 1]; }
  push(m) { m.cursor = m.cursor || 0; this.stack.push(m); }
  pop() { this.stack.pop(); }
  close() { this.stack = []; }

  openMain() {
    this.push({
      type: 'list', title: 'コマンド', x: 16, y: HUD_H + 16, w: 180,
      items: [
        { label: 'どうぐ', act: () => this.openInventory() },
        { label: 'じゅもん', act: () => this.openSpells() },
        { label: 'あしもと', act: () => this.footAction() },
        { label: 'ステータス', act: () => this.push({ type: 'status' }) },
        { label: 'やめる', act: () => this.pop() },
      ],
    });
  }

  openInventory() {
    const g = this.game, p = g.player;
    const build = () => p.inventory.map(it => {
      const def = ITEMS[it.id];
      let label = itemLabel(it);
      if (p.weapon === it || p.shield === it) label = 'E ' + label; else label = '  ' + label;
      return { label, icon: getItemIcon(it.id, def.kind), item: it, right: def.atk != null ? `攻${def.atk}` : def.def != null ? `守${def.def}` : '' };
    });
    const menu = {
      type: 'list', title: `どうぐ ${p.inventory.length}/${INV_MAX}`, x: 16, y: HUD_H + 16, w: 300, rows: 10,
      items: build(), refresh: () => { menu.items = build(); if (menu.cursor >= menu.items.length) menu.cursor = Math.max(0, menu.items.length - 1); },
      onSelect: (it) => this.openItemActions(it.item),
      showDesc: true,
    };
    if (!menu.items.length) { g.log('何も持っていない。'); return; }
    this.push(menu);
  }

  openItemActions(item) {
    const g = this.game, p = g.player;
    const def = ITEMS[item.id];
    const items = [];
    const done = (consumed) => { if (consumed) this.close(); else { this.pop(); this.top && this.top.refresh && this.top.refresh(); } };
    if (def.kind === 'weapon' || def.kind === 'shield') {
      items.push({ label: (p.weapon === item || p.shield === item) ? 'はずす' : 'そうび', act: () => done(equipItem(g, item)) });
      if (def.use) items.push({ label: 'つかう', act: () => done(useItem(g, item)) });
    } else if (def.kind !== 'key' && def.kind !== 'arrow') {
      items.push({ label: def.kind === 'scroll' ? 'よむ' : 'つかう', act: () => done(useItem(g, item)) });
    }
    items.push({ label: 'なげる', act: () => done(throwItem(g, item)) });
    items.push({ label: 'おく', act: () => done(dropItem(g, item)) });
    items.push({ label: 'やめる', act: () => this.pop() });
    this.push({ type: 'list', title: def.name, x: 330, y: HUD_H + 16, w: 150, items, desc: def.desc });
  }

  openSpells() {
    const g = this.game, p = g.player;
    const spells = spellsForLevel(p.lv);
    if (!spells.length) { g.log('呪文を覚えていない。'); return; }
    this.push({
      type: 'list', title: 'じゅもん', x: 16, y: HUD_H + 16, w: 260,
      items: spells.map(s => ({ label: s.name, right: `MP${s.mp}`, color: p.mp >= s.mp ? '#fff' : '#888', spell: s, desc: s.desc })),
      onSelect: (it) => { if (castSpell(g, it.spell)) this.close(); },
      showDesc: true,
    });
  }

  footAction() {
    const g = this.game, p = g.player;
    const it = g.itemAt(p.x, p.y);
    const onStairs = g.map.stairs.x === p.x && g.map.stairs.y === p.y;
    if (onStairs) { this.close(); this.openStairs(); return; }
    if (it) { if (pickUp(g)) this.close(); return; }
    g.log('足元には何もない。');
  }

  openStairs() {
    const g = this.game;
    const up = g.map.stairs.up;
    this.push({
      type: 'list', title: up ? '上り階段' : '下り階段', x: SCREEN_W / 2 - 90, y: SCREEN_H / 2 - 60, w: 180,
      items: [
        { label: up ? 'のぼる' : 'おりる', act: () => { this.close(); g.useStairs(); } },
        { label: 'やめる', act: () => this.pop() },
      ],
    });
  }

  // ---- 入力 ------------------------------------------------------------------
  handle(code) {
    const m = this.top;
    if (!m) return;
    if (m.type === 'status') { if (is(code, 'cancel') || is(code, 'ok')) this.pop(); return; }
    if (code === 'ArrowUp' || code === 'KeyW' || code === 'Numpad8' || code === 'KeyK') m.cursor = (m.cursor + m.items.length - 1) % m.items.length;
    else if (code === 'ArrowDown' || code === 'KeyS' || code === 'Numpad2' || code === 'KeyJ') m.cursor = (m.cursor + 1) % m.items.length;
    else if (is(code, 'ok')) {
      const it = m.items[m.cursor];
      if (!it) return;
      if (it.act) it.act(); else if (m.onSelect) m.onSelect(it);
    } else if (is(code, 'cancel') || is(code, 'inventory') && m.title && m.title.startsWith('どうぐ')) this.pop();
  }

  // ---- 描画 ------------------------------------------------------------------
  draw(ctx) {
    for (const m of this.stack) {
      if (m.type === 'status') { this.drawStatus(ctx); continue; }
      const h = drawMenu(ctx, m.x, m.y, m.w, m.items, m.cursor, { title: m.title, rows: m.rows });
      const cur = m.items[m.cursor];
      const desc = m.desc || (m.showDesc && cur && (cur.desc || (cur.item && ITEMS[cur.item.id].desc)));
      if (desc) {
        drawWindow(ctx, m.x, m.y + h + 4, Math.max(m.w, 300), LINE + 24);
        text(ctx, desc, m.x + 14, m.y + h + 16, '#fff');
      }
    }
  }

  drawStatus(ctx) {
    const p = this.game.player;
    const x = SCREEN_W / 2 - 170, y = HUD_H + 30, w = 340, h = 230;
    drawWindow(ctx, x, y, w, h, { title: 'クリフト' });
    const rows = [
      ['レベル', p.lv], ['HP', `${p.hp} / ${p.maxHp}`], ['MP', `${p.mp} / ${p.maxMp}`], ['力', p.str],
      ['攻撃力', playerAtk(p)], ['守備力', playerDef(p)], ['経験値', p.exp],
      ['武器', p.weapon ? ITEMS[p.weapon.id].name : 'なし'], ['盾', p.shield ? ITEMS[p.shield.id].name : 'なし'],
    ];
    rows.forEach(([k, v], i) => {
      text(ctx, k, x + 24, y + 20 + i * LINE, '#9cf');
      text(ctx, String(v), x + 130, y + 20 + i * LINE);
    });
  }
}
