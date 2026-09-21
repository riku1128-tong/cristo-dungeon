// 起動・メインループ・シーン管理
import { SCREEN_W, SCREEN_H, MOVE_MS } from './config.js';
import { loadAssets } from './assets.js';
import { Game } from './game.js';
import { Renderer } from './ui/renderer.js';
import { Input, is } from './ui/input.js';
import { MenuStack } from './ui/menu.js';
import { drawWindow, text, textCenter } from './ui/window.js';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed')) || (Date.now() & 0x7fffffff);
const autoplay = params.get('autoplay') === '1';

const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
const input = new Input(window);
const game = new Game(seed);
const menu = new MenuStack(game);
let lastMove = 0;
let flash = null;   // {text, t0}
let shownEvent = null;

game.onEvent = (ev) => {
  if (ev === 'pierce') flash = { text: 'キラーピアスを手に入れた！', t0: performance.now(), color: '#ff8' };
  if (ev === 'levelup') flash = { text: 'レベルアップ！', t0: performance.now(), color: '#8f8' };
};

function fit() {
  const availH = window.innerHeight - 28, availW = window.innerWidth;
  const scale = Math.max(1, Math.floor(Math.min(availW / SCREEN_W, availH / SCREEN_H) * 2) / 2);
  canvas.style.width = `${SCREEN_W * scale}px`;
  canvas.style.height = `${SCREEN_H * scale}px`;
}
window.addEventListener('resize', fit);
fit();

// ---- 入力処理 -----------------------------------------------------------------
function handlePlay(now) {
  const p = game.player;
  const keys = input.consume();
  if (menu.open) { for (const k of keys) menu.handle(k); return; }
  // 眠り中は自動でターンが進む
  if (p.status.sleep > 0) {
    if (now - lastMove > 200) { lastMove = now; game.rest(); }
    return;
  }
  for (const k of keys) {
    if (is(k, 'cancel')) { menu.openMain(); return; }
    if (is(k, 'inventory')) { menu.openInventory(); return; }
    if (is(k, 'spells')) { menu.openSpells(); return; }
    if (is(k, 'map')) { renderer.showMap = !renderer.showMap; return; }
    if (is(k, 'ok')) { game.attack(); lastMove = now; return; }
    if (is(k, 'rest')) { game.rest(); lastMove = now; return; }
    if (is(k, 'stairs')) { menu.footAction(); return; }
  }
  const dir = input.heldDir();
  if (dir && now - lastMove >= MOVE_MS) {
    if (input.shift) { p.dir = dir; lastMove = now; return; }
    const moved = game.tryMove(dir);
    lastMove = now;
    if (moved && game.state === 'play' && game.map.stairs.x === p.x && game.map.stairs.y === p.y) menu.openStairs();
  }
}

// ---- 自動プレイ (動作確認用): 階段へ BFS で向かいつつ、たまに道具・呪文・攻撃をランダムに行う
let auto = { floorKey: null, dist: null, runs: 0, deaths: 0, clears: 0, totalTurns: 0, maxFloor: 0 };
window.__auto = auto;
function handleAutoplay(now) {
  if (!autoplayFns) return;
  for (let n = 0; n < 4 && game.state === 'play'; n++) autoplayStep();
}
function autoplayStep() {
  const p = game.player;
  const rng = game.rng;
  if (menu.open) menu.close();
  if (p.status.sleep > 0) { game.rest(); return; }
  const s = game.map.stairs;
  if (s.x === p.x && s.y === p.y) { game.useStairs(); return; }
  const r = rng.next();
  if (r < 0.03 && p.inventory.length) {
    const it = rng.pick(p.inventory);
    const f = rng.pick([autoplayFns.useItem, autoplayFns.equipItem, autoplayFns.throwItem, autoplayFns.dropItem]);
    f(game, it);
    return;
  }
  if (r < 0.05) { const sp = autoplayFns.spellsForLevel(p.lv); if (sp.length) autoplayFns.castSpell(game, rng.pick(sp)); return; }
  // 隣接する敵を攻撃
  for (const k of DIRS_LIST) {
    const d = DIRS_[k];
    if (game.monsterAt(p.x + d.dx, p.y + d.dy) && autoplayFns.canStep(game.map, p.x, p.y, d.dx, d.dy)) { p.dir = k; game.attack(); return; }
  }
  const key = game.floor + ':' + game.returning + ':' + game.map.stairs.x;
  if (auto.floorKey !== key) { auto.floorKey = key; auto.dist = autoplayFns.bfsDistances(game.map, s.x, s.y); }
  const here = auto.dist[p.y * game.map.w + p.x];
  const order = rng.shuffle(['up', 'down', 'left', 'right']);
  for (const k of order) {
    const d = DIRS_[k], nx = p.x + d.dx, ny = p.y + d.dy;
    if (game.map.isFloor(nx, ny) && auto.dist[ny * game.map.w + nx] === here - 1 && !game.monsterAt(nx, ny)) { game.tryMove(k); return; }
  }
  for (const k of order) if (game.tryMove(k)) return;
  game.rest();
}
let autoplayFns = null;
let DIRS_ = null;
const DIRS_LIST = ['up', 'down', 'left', 'right', 'ul', 'ur', 'dl', 'dr'];
if (autoplay) {
  Promise.all([import('./systems/inventory.js'), import('./systems/spells.js'), import('./data/spells.js'), import('./config.js'), import('./dungeon.js')])
    .then(([inv, sp, sd, cfg, dg]) => { autoplayFns = { ...inv, ...sp, ...sd, canStep: dg.canStep, bfsDistances: dg.bfsDistances }; DIRS_ = cfg.DIRS; });
}

// ---- シーン描画 ----------------------------------------------------------------
function drawTitle(ctx, now) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  textCenter(ctx, 'クリフト', SCREEN_W / 2, 120, '#8f8', 40);
  textCenter(ctx, 'ふしぎのダンジョン', SCREEN_W / 2, 170, '#fff', 40);
  textCenter(ctx, 'B10F のキラーピアスを持ち帰れ', SCREEN_W / 2, 240, '#ccc', 16);
  if (Math.floor(now / 500) % 2 === 0) textCenter(ctx, 'PUSH Z / ENTER', SCREEN_W / 2, 320, '#fff', 20);
  text(ctx, `seed ${seed}`, 8, SCREEN_H - 24, '#666', 12);
}

function drawResult(ctx) {
  const p = game.player;
  const dead = game.state === 'dead';
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  const x = SCREEN_W / 2 - 200, y = 90, w = 400, h = 230;
  drawWindow(ctx, x, y, w, h);
  textCenter(ctx, dead ? 'クリフトは力尽きた…' : 'キラーピアスを持ち帰った！', SCREEN_W / 2, y + 24, dead ? '#f88' : '#ff8', 22);
  const lines = [`到達階: B${game.floor}F${game.returning ? '（帰り道）' : ''}`, `レベル: ${p.lv}`, `ターン数: ${game.turn}`, `倒した数: ${game.kills || 0}`];
  lines.forEach((l, i) => textCenter(ctx, l, SCREEN_W / 2, y + 70 + i * 26, '#fff', 18));
  textCenter(ctx, 'Z / ENTER でタイトルへ', SCREEN_W / 2, y + h - 34, '#ccc', 14);
}

function drawFlash(ctx, now) {
  if (!flash) return;
  const t = now - flash.t0;
  if (t > 2000) { flash = null; return; }
  ctx.globalAlpha = t < 200 ? t / 200 : t > 1600 ? (2000 - t) / 400 : 1;
  drawWindow(ctx, SCREEN_W / 2 - 160, 120, 320, 50);
  textCenter(ctx, flash.text, SCREEN_W / 2, 135, flash.color, 20);
  ctx.globalAlpha = 1;
}

// ---- メインループ ---------------------------------------------------------------
function frame(now) {
  const ctx = renderer.ctx;
  if (game.state === 'title') {
    const keys = input.consume();
    if (keys.some(k => is(k, 'ok')) || autoplay) { game.newGame(); }
    drawTitle(ctx, now);
  } else if (game.state === 'play') {
    if (autoplay && autoplayFns) handleAutoplay(now); else handlePlay(now);
    renderer.draw(game, now, (c) => { menu.draw(c); drawFlash(c, now); });
  } else {
    const keys = input.consume();
    if (keys.some(k => is(k, 'ok'))) { menu.close(); game.state = 'title'; }
    if (autoplay) { auto.runs++; if (game.state === 'dead') auto.deaths++; else auto.clears++; auto.totalTurns += game.turn; auto.maxFloor = Math.max(auto.maxFloor, game.floor); game.newGame(); }
    renderer.draw(game, now, (c) => drawResult(c));
  }
  requestAnimationFrame(frame);
}

(async () => {
  try { await document.fonts.load('16px DotGothic16'); } catch (e) { /* フォント無しでも動く */ }
  await loadAssets();
  window.__game = game;   // デバッグ用
  requestAnimationFrame(frame);
})();
