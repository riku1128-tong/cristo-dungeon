// マップ・キャラ・HUD・ログ・ミニマップの描画
import { TILE, CELL, SCREEN_W, SCREEN_H, HUD_H, LOG_H, LOG_LINES, MOVE_MS, BUMP_MS, WALK_FPS, DIRS } from '../config.js';
import { FLOOR, wallTileName } from '../dungeon.js';
import { getSprite, getTile, getObject, getItemIcon } from '../assets.js';
import { ITEMS } from '../data/items.js';
import { drawWindow, text, textRight, setFont, LINE } from './window.js';

const VIEW_Y = HUD_H;
const VIEW_H = SCREEN_H - HUD_H - LOG_H;

const tint = document.createElement('canvas');
tint.width = CELL; tint.height = CELL;
const tctx = tint.getContext('2d');

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.showMap = true;
    this.floorVariant = null;
  }

  // 補間済みの表示座標を更新
  updateAnim(e, now) {
    const t = e.anim.moveT0 ? (now - e.anim.moveT0) / MOVE_MS : 1;
    if (t >= 1) { e.vx = e.x; e.vy = e.y; e.anim.walking = false; }
    else { e.vx = e.anim.fromX + (e.x - e.anim.fromX) * t; e.vy = e.anim.fromY + (e.y - e.anim.fromY) * t; }
  }

  draw(game, now, overlay) {
    const ctx = this.ctx;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    if (!game.map) return;
    const p = game.player;
    this.updateAnim(p, now);
    for (const m of game.monsters) this.updateAnim(m, now);

    // カメラ
    const camX = Math.round(p.vx * TILE + TILE / 2 - SCREEN_W / 2);
    const camY = Math.round(p.vy * TILE + TILE / 2 - VIEW_H / 2);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, VIEW_Y, SCREEN_W, VIEW_H); ctx.clip();
    ctx.translate(-camX, VIEW_Y - camY);
    this.drawMap(game, camX, camY);
    this.drawObjects(game);
    const ents = [...game.monsters.filter(m => game.isVisible(m.x, m.y)), p].sort((a, b) => a.vy - b.vy);
    for (const e of ents) this.drawEntity(game, e, now);
    this.drawEffects(game, now);
    this.drawPopups(game, now);
    ctx.restore();

    this.drawHud(game);
    this.drawLog(game, now);
    if (this.showMap) this.drawMinimap(game);
    if (overlay) overlay(ctx);
  }

  drawMap(game, camX, camY) {
    const ctx = this.ctx, map = game.map;
    const x0 = Math.max(0, Math.floor(camX / TILE)), x1 = Math.min(map.w - 1, Math.ceil((camX + SCREEN_W) / TILE));
    const y0 = Math.max(0, Math.floor(camY / TILE)), y1 = Math.min(map.h - 1, Math.ceil((camY + VIEW_H) / TILE));
    if (!this.floorVariant || this.floorVariant.length !== map.w * map.h) {
      this.floorVariant = new Uint8Array(map.w * map.h);
      for (let i = 0; i < this.floorVariant.length; i++) this.floorVariant[i] = (i * 2654435761 >>> 0) % 7 === 0 ? 1 + (i % 2) : 0;
    }
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * map.w + x;
      const vis = game.visible[i] === 1;
      let t;
      const isFloor = map.tiles[i] === FLOOR;
      const px = x * TILE, py = y * TILE;
      if (isFloor) {
        t = getTile('floor' + this.floorVariant[i]);
        ctx.drawImage(t.img, t.sx, t.sy, t.size, t.size, px, py, TILE, TILE);
        // 通路は部屋より暗くして区別、1 マスごとに薄いグリッド
        if (map.roomId[i] < 0) { ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(px, py, TILE, TILE); }
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(px, py, TILE, 1);
        ctx.fillRect(px, py, 1, TILE);
      } else {
        // トルネコ風: 全ての壁をブロックとして描く。下が床なら「正面」、それ以外は「上面」
        t = getTile(((x * 7 + y * 13) % 5 === 0) ? 'wall_solid1' : 'wall_solid0');
        ctx.drawImage(t.img, t.sx, t.sy, t.size, t.size, px, py, TILE, TILE);
        if (map.isFloor(x, y + 1)) {
          ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(px, py, TILE, TILE);           // 正面は影
          ctx.fillStyle = 'rgba(0,0,0,0.35)';                                             // 石積みの横目地
          for (let ly = 8; ly < TILE; ly += 8) ctx.fillRect(px, py + ly, TILE, 1);
          ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(px, py, TILE, 2);       // 上端のハイライト(角)
          ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(px, py + TILE - 2, TILE, 2);   // 床との境目
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(px, py, TILE, TILE);   // 上面は明るめ
          if (map.isFloor(x, y - 1)) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(px, py, TILE, 2); }
        }
        // 左右が床なら側面の縁
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        if (map.isFloor(x + 1, y)) ctx.fillRect(px + TILE - 2, py, 2, TILE);
        if (map.isFloor(x - 1, y)) ctx.fillRect(px, py, 2, TILE);
        // 上面のブロック目地
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(px, py, TILE, 1); ctx.fillRect(px, py, 1, TILE);
      }
      // 見えていない所は薄暗く。未探索はさらに暗いが輪郭は分かる
      if (!vis) { ctx.fillStyle = map.explored[i] ? 'rgba(0,0,0,0.42)' : 'rgba(0,0,0,0.62)'; ctx.fillRect(x * TILE, y * TILE, TILE, TILE); }
    }
  }

  drawObjects(game) {
    const ctx = this.ctx, map = game.map;
    const s = map.stairs;
    if (map.explored[s.y * map.w + s.x]) {
      const o = getObject(s.up ? 'stairs_up' : 'stairs_down');
      ctx.drawImage(o.img, o.sx, o.sy, o.size, o.size, s.x * TILE, s.y * TILE, TILE, TILE);
    }
    for (const t of game.traps) if (t.found && map.explored[t.y * map.w + t.x]) {
      const o = getObject('trap');
      ctx.drawImage(o.img, o.sx, o.sy, o.size, o.size, t.x * TILE, t.y * TILE, TILE, TILE);
    }
    for (const it of game.items) {
      if (!game.isVisible(it.x, it.y) && !map.explored[it.y * map.w + it.x]) continue;
      const def = ITEMS[it.item.id];
      const ic = getItemIcon(it.item.id, def.kind);
      ctx.drawImage(ic.img, ic.sx, ic.sy, ic.size, ic.size, it.x * TILE, it.y * TILE, TILE, TILE);
    }
  }

  drawEntity(game, e, now) {
    const ctx = this.ctx;
    const sprId = e.kind === 'player' ? 'cristo' : e.def.sprite;
    const spr = getSprite(sprId, e.kind === 'player' ? '#40c040' : e.def.color);
    const dirKey = e.dir in DIRS ? e.dir : 'down';
    const row = DIRS[dirKey].row;
    let frame = 0;
    if (spr.frames > 1) {
      if (e.anim.walking) frame = Math.floor(now / (1000 / WALK_FPS)) % spr.frames;
      else if (e.kind === 'player') frame = Math.floor(now / (1000 / 3)) % spr.frames;  // 待機中もゆっくり足踏み
      else frame = 0;
    }
    let px = e.vx * TILE + TILE / 2 - CELL / 2;
    let py = e.vy * TILE + TILE - CELL + 2;
    if (spr.bounce) py += Math.round(Math.abs(Math.sin(now / 260 + (e.uid || 0))) * -4);
    if (e.anim.bump) {
      const t = (now - e.anim.bump.t0) / BUMP_MS;
      if (t >= 1) e.anim.bump = null;
      else { const d = DIRS[e.anim.bump.dir] || DIRS.down; const k = Math.sin(t * Math.PI) * 10; px += d.dx * k; py += d.dy * k; }
    }
    px = Math.round(px); py = Math.round(py);
    const sx = frame * spr.cell, sy = row * spr.cell;
    // 睡眠表示
    if (e.kind === 'monster' && (e.asleep || e.status.sleep > 0)) {
      ctx.globalAlpha = 0.85;
    }
    if (now - e.anim.hitT < 120) {
      tctx.clearRect(0, 0, CELL, CELL);
      tctx.drawImage(spr.img, sx, sy, spr.cell, spr.cell, 0, 0, CELL, CELL);
      tctx.globalCompositeOperation = 'source-atop';
      tctx.fillStyle = e.kind === 'player' ? 'rgba(255,60,60,0.75)' : 'rgba(255,255,255,0.8)';
      tctx.fillRect(0, 0, CELL, CELL);
      tctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(tint, px, py);
    } else {
      ctx.drawImage(spr.img, sx, sy, spr.cell, spr.cell, px, py, CELL, CELL);
    }
    ctx.globalAlpha = 1;
    if (e.kind === 'monster') {
      if (e.asleep || e.status.sleep > 0) text(ctx, 'z', px + CELL - 14, py + 4, '#8cf', 14);
      if (e.status.mahotone > 0) text(ctx, '封', px + 2, py + 4, '#f8c', 12);
      // HP バー（ダメージを受けた敵のみ）
      if (e.hp < e.maxHp) {
        const w = 28, x = e.vx * TILE + 2, y = e.vy * TILE + TILE - 3;
        ctx.fillStyle = '#000'; ctx.fillRect(x - 1, y - 1, w + 2, 4);
        ctx.fillStyle = '#e33'; ctx.fillRect(x, y, Math.max(1, Math.round(w * e.hp / e.maxHp)), 2);
      }
    }
  }

  // 回復エフェクト: 緑の光の粒が舞い上がり、足元に光の輪
  drawEffects(game, now) {
    const ctx = this.ctx;
    const DUR = 750;
    game.effects = game.effects.filter(e => now - e.t0 < DUR);
    for (const e of game.effects) {
      if (e.type !== 'heal') continue;
      const t = (now - e.t0) / DUR;
      const cx = e.x * TILE + TILE / 2, cy = e.y * TILE + TILE / 2;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = '#8f8';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(cx, cy + 10, 8 + t * 18, 4 + t * 8, 0, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 10; i++) {
        const a = i * 0.63 + e.t0 * 0.001;
        const r = 6 + (i % 3) * 5;
        const px = cx + Math.cos(a) * r, py = cy + 12 - t * (34 + (i % 4) * 8) + Math.sin(a) * 3;
        const sz = i % 2 ? 3 : 2;
        ctx.fillStyle = i % 3 === 0 ? '#fff' : '#7f7';
        ctx.fillRect(Math.round(px), Math.round(py), sz, sz);
        ctx.fillRect(Math.round(px) - 1, Math.round(py) + 1, 1, 1);
      }
      ctx.restore();
    }
  }

  drawPopups(game, now) {
    const ctx = this.ctx;
    game.popups = game.popups.filter(p => now - p.t0 < 700);
    for (const p of game.popups) {
      const t = (now - p.t0) / 700;
      const y = p.y * TILE - 8 - t * 22;
      setFont(ctx, 16);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#000';
      ctx.fillText(p.text, p.x * TILE + TILE / 2 + 1, y + 1);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x * TILE + TILE / 2, y);
      ctx.textAlign = 'left';
    }
  }

  drawHud(game) {
    const ctx = this.ctx, p = game.player;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, SCREEN_W, HUD_H);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, HUD_H - 2, SCREEN_W, 1);
    const y = 6;
    text(ctx, `B${game.floor}F${game.returning ? '↑' : ''}`, 10, y, '#fff');
    text(ctx, `Lv ${p.lv}`, 80, y);
    const hpCol = p.hp <= p.maxHp / 4 ? '#f66' : p.hp <= p.maxHp / 2 ? '#fc6' : '#fff';
    text(ctx, `HP ${p.hp}/${p.maxHp}`, 140, y, hpCol);
    this.bar(ctx, 250, y + 4, 90, 8, p.hp / p.maxHp, hpCol === '#fff' ? '#3c3' : hpCol);
    text(ctx, `MP ${p.mp}/${p.maxMp}`, 352, y, '#9cf');
    this.bar(ctx, 450, y + 4, 60, 8, p.mp / p.maxMp, '#39f');
    text(ctx, `力 ${p.str}`, 522, y);
    const hCol = p.hunger <= 20 ? '#f66' : '#fff';
    text(ctx, `満腹度 ${p.hunger}%`, 580, y, hCol);
    const st = [];
    if (p.status.poison > 0) st.push('毒');
    if (p.status.sleep > 0) st.push('眠');
    if (p.status.confusion > 0) st.push('混');
    if (p.status.sukara > 0) st.push('守');
    if (p.status.baikiruto > 0) st.push('攻');
    if (st.length) textRight(ctx, st.join(' '), SCREEN_W - 10, y, '#fc6');
  }

  bar(ctx, x, y, w, h, ratio, color) {
    ctx.fillStyle = '#333'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color; ctx.fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, ratio))), h);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  drawLog(game, now) {
    const ctx = this.ctx;
    const y = SCREEN_H - LOG_H;
    drawWindow(ctx, 0, y, SCREEN_W, LOG_H);
    const msgs = game.messages.slice(-LOG_LINES);
    msgs.forEach((m, i) => {
      const age = now - m.t;
      const col = age < 4000 ? '#fff' : '#aaa';
      text(ctx, m.text, 16, y + 10 + i * LINE, col);
    });
  }

  drawMinimap(game) {
    const ctx = this.ctx, map = game.map, p = game.player;
    const s = 3;
    const w = map.w * s, h = map.h * s;
    const ox = SCREEN_W - w - 8, oy = HUD_H + 8;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(ox - 2, oy - 2, w + 4, h + 4);
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      const i = y * map.w + x;
      if (!map.explored[i] || map.tiles[i] !== FLOOR) continue;
      ctx.fillStyle = game.visible[i] ? 'rgba(120,200,255,0.75)' : 'rgba(80,120,170,0.55)';
      ctx.fillRect(ox + x * s, oy + y * s, s, s);
    }
    const st = map.stairs;
    if (map.explored[st.y * map.w + st.x]) { ctx.fillStyle = '#ff0'; ctx.fillRect(ox + st.x * s, oy + st.y * s, s, s); }
    for (const it of game.items) if (map.explored[it.y * map.w + it.x]) { ctx.fillStyle = it.item.id === 'i_killer_pierce' ? '#f0f' : '#4f4'; ctx.fillRect(ox + it.x * s, oy + it.y * s, s, s); }
    for (const m of game.monsters) if (game.isVisible(m.x, m.y)) { ctx.fillStyle = '#f44'; ctx.fillRect(ox + m.x * s, oy + m.y * s, s, s); }
    ctx.fillStyle = '#fff'; ctx.fillRect(ox + p.x * s, oy + p.y * s, s, s);
  }
}
