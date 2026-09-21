// 経験値テーブル (Lv n に必要な累計 EXP) と成長
export const EXP_TABLE = [0, 0, 5, 12, 25, 45, 70, 100, 140, 200, 280, 380, 500, 650, 830, 1050, 1300, 1600, 1950, 2350, 2800];
export const MAX_LV = 20;

export function levelForExp(exp) {
  let lv = 1;
  while (lv < MAX_LV && exp >= EXP_TABLE[lv + 1]) lv++;
  return lv;
}

// レベルアップ時の上昇値
export function growth(rng, lv) {
  return {
    hp: rng.int(5, 7),
    mp: rng.int(2, 3),
    str: lv % 4 === 0 ? 1 : 0,
  };
}

export const START = { hp: 15, mp: 8, str: 8, hunger: 100 };
