// 経験値テーブル (Lv n に必要な累計 EXP) と成長
export const EXP_TABLE = [0, 0, 8, 20, 40, 70, 110, 165, 240, 330, 450, 600, 780, 1000, 1250, 1550, 1900, 2300, 2750, 3250, 3800];
export const MAX_LV = 20;

export function levelForExp(exp) {
  let lv = 1;
  while (lv < MAX_LV && exp >= EXP_TABLE[lv + 1]) lv++;
  return lv;
}

// レベルアップ時の上昇値
export function growth(rng, lv) {
  return {
    hp: rng.int(4, 6),
    mp: rng.int(2, 3),
    str: lv % 4 === 0 ? 1 : 0,
  };
}

export const START = { hp: 15, mp: 8, str: 8, hunger: 100 };
