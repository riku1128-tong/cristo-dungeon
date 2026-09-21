// 画面・マップの基本定数
export const TILE = 32;          // マップタイル 1 マス
export const CELL = 48;          // キャラクタースプライトのセル
export const SCREEN_W = 768;
export const SCREEN_H = 432;
export const MAP_W = 56;
export const MAP_H = 32;

export const HUD_H = 28;         // 上部ステータスバー
export const LOG_LINES = 3;      // 下部メッセージ行数
export const LOG_H = 22 * LOG_LINES + 14;

export const MOVE_MS = 110;      // 1 マス移動の補間時間
export const BUMP_MS = 140;      // 攻撃バンプ
export const WALK_FPS = 8;       // 歩行アニメ速度

export const MAX_FLOOR = 10;     // キラーピアスのある階
export const INV_MAX = 20;

export const FONT = '"DotGothic16", "MS Gothic", monospace';

// 方向: dx, dy, スプライト行
export const DIRS = {
  down:  { dx: 0,  dy: 1,  row: 0 },
  left:  { dx: -1, dy: 0,  row: 1 },
  right: { dx: 1,  dy: 0,  row: 2 },
  up:    { dx: 0,  dy: -1, row: 3 },
  dl:    { dx: -1, dy: 1,  row: 0 },
  dr:    { dx: 1,  dy: 1,  row: 0 },
  ul:    { dx: -1, dy: -1, row: 3 },
  ur:    { dx: 1,  dy: -1, row: 3 },
};
export const DIR8 = ['down', 'dl', 'left', 'ul', 'up', 'ur', 'right', 'dr'];

export function dirFromDelta(dx, dy) {
  for (const [k, d] of Object.entries(DIRS)) if (d.dx === Math.sign(dx) && d.dy === Math.sign(dy)) return k;
  return 'down';
}
