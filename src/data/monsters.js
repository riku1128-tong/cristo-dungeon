// 敵テーブル。floors: 出現階の範囲、w: 出現重み
// skill: 敵の特技（マホトーンで封印、ミラーシールドで無効化）
//   melee_poison: 通常攻撃に毒付与 / spell_damage: 部屋内から呪文で直接ダメージ / spell_sleep: 隣接時に眠らせる
export const MONSTERS = {
  slime:          { name: 'スライム',       sprite: 'slime',          color: '#4080f0', floors: [1, 3],  hp: 6, atk: 3, def: 2,  exp: 2,  w: 10 },
  hammerhood:     { name: 'おおきづち',     sprite: 'hammerhood',     color: '#a06030', floors: [1, 4],  hp: 10, atk: 6, def: 3,  exp: 5,  w: 7 },
  dracky:         { name: 'ドラキー',       sprite: 'dracky',         color: '#8040c0', floors: [2, 5],  hp: 9, atk: 5, def: 3,  exp: 4,  w: 8,
                    skill: { type: 'spell_sleep', name: 'ラリホー', chance: 0.25, turns: [2, 4] } },
  bubble_slime:   { name: 'バブルスライム', sprite: 'bubble_slime',   color: '#60a040', floors: [3, 6],  hp: 14, atk: 7, def: 4,  exp: 7,  w: 8,
                    skill: { type: 'melee_poison', name: 'どくこうげき', chance: 0.4 } },
  skeleton:       { name: 'がいこつ',       sprite: 'skeleton',       color: '#e0e0d0', floors: [4, 8],  hp: 22, atk: 10, def: 6,  exp: 14, w: 8, undead: true },
  wizard:         { name: 'まほうつかい',   sprite: 'wizard',         color: '#6040a0', floors: [5, 8],  hp: 18, atk: 8, def: 5,  exp: 16, w: 6,
                    skill: { type: 'spell_damage', name: 'ギラ', chance: 0.35, dmg: [8, 14] } },
  ghost:          { name: 'ゆうれい',       sprite: 'ghost',          color: '#c0d0e0', floors: [6, 9],  hp: 24, atk: 12, def: 7,  exp: 20, w: 7, undead: true },
  rotting_corpse: { name: 'くさったしたい', sprite: 'rotting_corpse', color: '#508050', floors: [6, 9],  hp: 36, atk: 13, def: 5,  exp: 24, w: 7, undead: true,
                    skill: { type: 'melee_poison', name: 'どくこうげき', chance: 0.35 } },
  mummy:          { name: 'ミイラおとこ',   sprite: 'mummy',          color: '#d0c090', floors: [7, 10], hp: 55, atk: 16, def: 9,  exp: 38, w: 7, undead: true },
  baby_satan:     { name: 'ベビーサタン',   sprite: 'baby_satan',     color: '#e04040', floors: [8, 10], hp: 42, atk: 18, def: 10, exp: 45, w: 6,
                    skill: { type: 'spell_damage', name: 'メラ', chance: 0.3, dmg: [12, 20] } },
  metal_slime:    { name: 'はぐれメタル',   sprite: 'metal_slime',    color: '#c0c8d0', floors: [5, 10], hp: 6, atk: 10, def: 60, exp: 300, w: 1, flee: true, metal: true },
};

export function monstersForFloor(floor) {
  return Object.entries(MONSTERS)
    .filter(([, m]) => floor >= m.floors[0] && floor <= m.floors[1])
    .map(([id, m]) => ({ id, ...m }));
}
