// クリフトがレベルで習得する呪文
// target: self | front(前方1体) | room(部屋全体)
export const SPELLS = [
  { id: 'hoimi',    name: 'ホイミ',   lv: 1,  mp: 3,  target: 'self', desc: 'HPを25回復する' },
  { id: 'sukara',   name: 'スカラ',   lv: 4,  mp: 3,  target: 'self', desc: '20ターン守備力1.5倍' },
  { id: 'zaki',     name: 'ザキ',     lv: 7,  mp: 5,  target: 'front', desc: '前方の敵を50%で即死' },
  { id: 'behoimi',  name: 'ベホイミ', lv: 10, mp: 6,  target: 'self', desc: 'HPを60回復する' },
  { id: 'baikiruto',name: 'バイキルト', lv: 13, mp: 4, target: 'self', desc: '15ターン攻撃力2倍' },
  { id: 'zaraki',   name: 'ザラキ',   lv: 16, mp: 10, target: 'room', desc: '部屋の敵をそれぞれ40%で即死' },
];

export function spellsForLevel(lv) {
  return SPELLS.filter(s => s.lv <= lv);
}
