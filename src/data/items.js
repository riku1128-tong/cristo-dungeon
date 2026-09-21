// アイテム定義。効果の実処理は systems/inventory.js / combat.js が id を見て行う
// kind: weapon | shield | herb | food | scroll | seed | potion | arrow | key
// floors: 落ちている階の範囲, w: 出現重み
export const ITEMS = {
  // ---- 武器 ----
  w_cypress_stick:    { kind: 'weapon', name: 'ひのきのぼう',     atk: 2,  floors: [1, 4],  w: 10 },
  w_blessed_staff:    { kind: 'weapon', name: '祝福の杖',         atk: 3,  floors: [1, 6],  w: 6,  use: { mp: 5,  effect: 'hoimi' },    desc: 'つかう: ホイミ HP+12(MP5)' },
  w_club:             { kind: 'weapon', name: 'こんぼう',         atk: 4,  floors: [1, 5],  w: 9 },
  w_copper_sword:     { kind: 'weapon', name: '銅の剣',           atk: 6,  floors: [2, 7],  w: 8 },
  w_holy_knife:       { kind: 'weapon', name: '聖なるナイフ',     atk: 5,  floors: [2, 8],  w: 6,  passive: 'undead', desc: 'アンデッドに大ダメージ' },
  w_crossbow:         { kind: 'weapon', name: 'クロスボウ',       atk: 4,  floors: [2, 8],  w: 5,  use: { mp: 0,  effect: 'shoot' },    desc: 'つかう: 矢を撃つ' },
  w_chain_sickle:     { kind: 'weapon', name: 'くさりがま',       atk: 8,  floors: [3, 9],  w: 6 },
  w_iron_spear:       { kind: 'weapon', name: '鉄の槍',           atk: 9,  floors: [4, 10], w: 6 },
  w_holy_lance:       { kind: 'weapon', name: 'ホーリーランス',   atk: 12, floors: [6, 10], w: 3,  passive: 'undead', desc: 'アンデッドに大ダメージ' },
  w_smile_staff:      { kind: 'weapon', name: '微笑みの杖',       atk: 6,  floors: [4, 10], w: 1,  use: { mp: 5,  effect: 'sleep' },    desc: 'つかう: 50%で敵を眠らせる(MP5)' },
  w_wrath_staff:      { kind: 'weapon', name: '天罰の杖',         atk: 7,  floors: [4, 10], w: 4,  use: { mp: 8,  effect: 'bagima' },   desc: 'つかう: バギマ 前方3方向(MP8)' },
  w_seal_staff:       { kind: 'weapon', name: '魔封じの杖',       atk: 7,  floors: [4, 10], w: 4,  use: { mp: 7,  effect: 'mahotone' }, desc: 'つかう: 敵の特技を封じる(MP7)' },
  w_mind_staff:       { kind: 'weapon', name: '理力の杖',         atk: 8,  floors: [5, 10], w: 4,  passive: 'mind', desc: '攻撃時MP1消費でダメージ増' },
  w_magma_staff:      { kind: 'weapon', name: 'マグマの杖',       atk: 8,  floors: [6, 10], w: 3,  use: { mp: 14, effect: 'io' },       desc: 'つかう: イオ 部屋全体(MP14)' },
  w_miracle_sword:    { kind: 'weapon', name: '奇跡の剣',         atk: 14, floors: [7, 10], w: 2,  passive: 'miracle', desc: '攻撃するたびHP回復' },
  w_metal_slime_sword:{ kind: 'weapon', name: 'はぐれメタルの剣', atk: 22, floors: [8, 10], w: 1 },
  // ---- 盾 ----
  s_leather_shield:   { kind: 'shield', name: '皮の盾',           def: 2,  floors: [1, 5],  w: 10, passive: 'hunger_half', desc: '満腹度の減りが半分' },
  s_scale_shield:     { kind: 'shield', name: 'うろこの盾',       def: 4,  floors: [2, 7],  w: 8,  passive: 'poison_immune', desc: '毒を受けない' },
  s_iron_shield:      { kind: 'shield', name: '鉄の盾',           def: 8,  floors: [4, 10], w: 6 },
  s_power_shield:     { kind: 'shield', name: '力の盾',           def: 6,  floors: [4, 10], w: 4,  passive: 'str3', desc: '力+3' },
  s_mirror_shield:    { kind: 'shield', name: 'ミラーシールド',   def: 10, floors: [6, 10], w: 2,  passive: 'mirror', desc: '敵の特技を無効化' },
  s_metal_slime_shield:{ kind: 'shield', name: 'はぐれメタルの盾', def: 18, floors: [8, 10], w: 1 },
  // ---- 消耗品 ----
  i_herb:             { kind: 'herb',   name: 'やくそう',         floors: [1, 10], w: 20, effect: 'heal', amount: 30 },
  i_herb_plus:        { kind: 'herb',   name: '上やくそう',       floors: [3, 10], w: 8,  effect: 'heal', amount: 80 },
  i_antidote:         { kind: 'herb',   name: '毒消し草',         floors: [2, 10], w: 8,  effect: 'cure_poison' },
  i_bread:            { kind: 'food',   name: 'パン',             floors: [1, 10], w: 14, effect: 'food', amount: 50 },
  i_big_bread:        { kind: 'food',   name: '大きなパン',       floors: [3, 10], w: 6,  effect: 'food', amount: 100 },
  i_power_seed:       { kind: 'seed',   name: 'ちからのたね',     floors: [2, 10], w: 4,  effect: 'str_up' },
  i_life_nut:         { kind: 'seed',   name: '命の木の実',       floors: [2, 10], w: 4,  effect: 'maxhp_up' },
  i_holy_water:       { kind: 'potion', name: '魔法の聖水',       floors: [1, 10], w: 8,  effect: 'mp', amount: 15 },
  i_arrows:           { kind: 'arrow',  name: '矢',               floors: [1, 10], w: 8,  stack: [5, 12] },
  i_scroll_remira:    { kind: 'scroll', name: 'レミーラの巻物',   floors: [1, 10], w: 7,  effect: 'remira', desc: 'フロアの地形を映し出す' },
  i_scroll_basilura:  { kind: 'scroll', name: 'バシルーラの巻物', floors: [2, 10], w: 5,  effect: 'basilura', desc: '部屋の敵を吹き飛ばす' },
  i_scroll_sleep:     { kind: 'scroll', name: '眠りの巻物',       floors: [2, 10], w: 5,  effect: 'sleep_room', desc: '部屋の敵を眠らせる' },
  i_killer_pierce:    { kind: 'key',    name: 'キラーピアス',     floors: [99, 99], w: 0, desc: '伝説のイヤリング。持ち帰るのだ' },
};

export function itemsForFloor(floor) {
  return Object.entries(ITEMS)
    .filter(([, it]) => it.w > 0 && floor >= it.floors[0] && floor <= it.floors[1])
    .map(([id, it]) => ({ id, ...it }));
}

// インベントリに入る実体
export function makeItem(id, rng) {
  const def = ITEMS[id];
  const it = { id, kind: def.kind, name: def.name };
  if (def.stack) it.count = rng ? rng.int(def.stack[0], def.stack[1]) : def.stack[0];
  return it;
}

export function itemDef(item) { return ITEMS[item.id]; }

export function itemLabel(item) {
  const def = ITEMS[item.id];
  let s = def.name;
  if (item.count != null) s += ` ×${item.count}`;
  return s;
}
