// トルネコ式の視界: 部屋の中なら部屋全体(+出入口の縁)、通路なら周囲 1 マス
export function computeVisible(map, px, py) {
  const vis = new Uint8Array(map.w * map.h);
  const mark = (x, y) => { if (map.inBounds(x, y)) vis[y * map.w + x] = 1; };
  const room = map.roomAt(px, py);
  if (room && !room.node) {
    for (let y = room.y - 1; y <= room.y + room.h; y++)
      for (let x = room.x - 1; x <= room.x + room.w; x++) mark(x, y);
  } else {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) mark(px + dx, py + dy);
  }
  for (let i = 0; i < vis.length; i++) if (vis[i]) map.explored[i] = 1;
  return vis;
}

export function isVisible(vis, map, x, y) {
  return map.inBounds(x, y) && vis[y * map.w + x] === 1;
}
