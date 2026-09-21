// クリフトがレベルで習得する呪文
// target: self | front(前方1体) | room(部屋全体)
export const SPELLS = [
  { id: 'hoimi',    name: 'ホイミ',   lv: 1,  mp: 4,  target: 'self', desc: 'HPを15回復する' },
  { id: 'sukara',   name: 'スカラ',   lv: 4,  mp: 4,  target: 'self', desc: '20ターン守備力1.5倍' },
  { id: 'zaki',     name: 'ザキ',     lv: 7,  mp: 7,  target: 'front', desc: '前方の敵を50%で即死' },
  { id: 'behoimi',  name: 'ベホイミ', lv: 10, mp: 9,  target: 'self', desc: 'HPを45回復する' },
  { id: 'baikiruto',name: 'バイキルト', lv: 13, mp: 6, target: 'self', desc: '15ターン攻撃力2倍' },
  { id: 'zaraki',   name: 'ザラキ',   lv: 16, mp: 14, target: 'room', desc: '部屋の敵をそれぞれ40%で即死' },
];

export function spellsForLevel(lv) {
  return SPELLS.filter(s => s.lv <= lv);
}
