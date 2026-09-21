// DQ 風ウィンドウとテキスト描画
import { FONT } from '../config.js';

export const TEXT = 16;      // フォントサイズ
export const LINE = 22;      // 行送り

export function setFont(ctx, size = TEXT) {
  ctx.font = `${size}px ${FONT}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
}

// 黒地・白二重枠の DQ ウィンドウ
export function drawWindow(ctx, x, y, w, h, opts = {}) {
  ctx.fillStyle = opts.fill || 'rgba(0,0,0,0.92)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#000';
  ctx.strokeRect(x + 5.5, y + 5.5, w - 11, h - 11);
  if (opts.title) {
    setFont(ctx);
    const tw = ctx.measureText(opts.title).width;
    ctx.fillStyle = '#000';
    ctx.fillRect(x + 14, y - 2, tw + 12, TEXT + 6);
    ctx.fillStyle = '#fff';
    ctx.fillText(opts.title, x + 20, y + 1);
  }
}

export function text(ctx, str, x, y, color = '#fff', size = TEXT) {
  setFont(ctx, size);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

export function textRight(ctx, str, x, y, color = '#fff', size = TEXT) {
  setFont(ctx, size);
  ctx.textAlign = 'right';
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  ctx.textAlign = 'left';
}

export function textCenter(ctx, str, cx, y, color = '#fff', size = TEXT) {
  setFont(ctx, size);
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.fillText(str, cx, y);
  ctx.textAlign = 'left';
}

// 汎用メニュー描画。items: [{label, right?, color?, icon?}] cursor: index
export function drawMenu(ctx, x, y, w, items, cursor, opts = {}) {
  const pad = 14;
  const top = opts.title ? 12 : 0;   // タイトル分だけ下げる
  const rows = opts.rows || items.length;
  const h = rows * LINE + pad * 2 + 4 + top;
  drawWindow(ctx, x, y, w, h, { title: opts.title });
  y += top;
  const first = Math.max(0, Math.min(cursor - rows + 1, items.length - rows));
  const start = opts.scroll != null ? opts.scroll : Math.max(0, first);
  for (let i = 0; i < rows; i++) {
    const idx = start + i;
    if (idx >= items.length) break;
    const it = items[idx];
    const ty = y + pad + 4 + i * LINE;
    if (idx === cursor) text(ctx, '▶', x + pad, ty, '#fff');
    if (it.icon) { ctx.drawImage(it.icon.img, it.icon.sx, it.icon.sy, it.icon.size, it.icon.size, x + pad + 18, ty - 4, 24, 24); }
    text(ctx, it.label, x + pad + (it.icon ? 46 : 22), ty, it.color || '#fff');
    if (it.right) textRight(ctx, it.right, x + w - pad - 6, ty, it.color || '#fff');
  }
  if (items.length > rows) {
    if (start > 0) textCenter(ctx, '▲', x + w / 2, y + 2, '#fff', 12);
    if (start + rows < items.length) textCenter(ctx, '▼', x + w / 2, y + h - 16, '#fff', 12);
  }
  return h;
}
