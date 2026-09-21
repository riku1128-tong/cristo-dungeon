# クリフト ふしぎのダンジョン

SFC「トルネコの大冒険」風のブラウザ・ローグライク。主人公は DQ4 の神官クリフト。
**B10F に眠る「キラーピアス」を手に入れて、地上へ帰還せよ。**

- Vanilla JS (ES Modules) + Canvas。ビルド不要、`index.html` を静的サーバで開くだけ
- ドット絵は [Retro Diffusion](https://retrodiffusion.ai) API で生成 → `tools/` の Python パイプラインで SFC 風（15色・48px）に整形
- 絵が無いものはコード描画の仮ドット絵で動く（`assets/manifest.json` 駆動なので差し替えにコード変更不要）

## 遊び方

```
python -m http.server 8000     # プロジェクト直下で
# → http://localhost:8000/        (?seed=123 で同じダンジョンを再現)
```

| 操作 | キー |
|---|---|
| 移動 | 矢印 / WASD / テンキー（斜め: テンキー 1379・YUBN・矢印2つ同時） |
| 向きだけ変える | Shift + 方向 |
| 攻撃 / 決定 | Z / Enter / Space |
| メニュー / キャンセル | X / Esc |
| どうぐ | I |
| じゅもん | M |
| 足踏み（1ターン待つ） | R / . |
| 足元（拾う・階段） | F（階段に乗ると自動で確認が出る） |
| 地図の表示切替 | Tab |

## ゲーム仕様

- パラメータ: HP / **MP** / 力 / 満腹度。MP は武器の特殊効果と呪文で消費。自然回復はせず、魔法の聖水とレベルアップでのみ回復
- 呪文（レベル習得）: ホイミ Lv1 / スカラ Lv4 / ザキ Lv7 / ベホイミ Lv10 / バイキルト Lv13 / ザラキ Lv16
- 武器 16 種（祝福の杖・聖なるナイフ・クロスボウ・鉄の槍・ホーリーランス・微笑みの杖・天罰の杖・魔封じの杖・理力の杖・マグマの杖・奇跡の剣・はぐれメタルの剣 ほか）、盾 6 種（皮・うろこ・鉄・力・ミラー・はぐれメタル）。効果は `src/data/items.js`
- B1〜B9F は下り階段、B10F でキラーピアスを拾うと上り階段で帰還。帰り道のフロアは新規生成
- 敵 11 種（`src/data/monsters.js`）。ドラキーのラリホー、まほうつかいのギラなどはマホトーン／ミラーシールドで対策可能

## 開発

```
npm install                       # 検証用 (puppeteer-core)。ゲーム本体には不要
npm test                          # tests/test.html を headless Chrome で実行（武器・盾・呪文・ダンジョン）
node tools/shot.mjs --seed 1 --keys "Enter,ArrowRight*3,KeyI" --out shots/a.png   # スクリーンショット
node tools/shot.mjs --autoplay --turns 5000                                      # ボットで通しプレイ（例外検出・バランス）
```

## アセット生成（Retro Diffusion）

```
setx RD_API_KEY "rdpk-..."            # または tools/.env に RD_API_KEY=...
python tools/gen_assets.py --validate   # スタイルとサイズをカタログで検証
python tools/gen_assets.py --dry-run    # 費用見積り（無料）
python tools/gen_assets.py              # 未生成分を生成 → assets/raw/
python tools/build_sheets.py            # シート化 → assets/{sprites,tiles,items} + manifest.json
```

プロンプト・スタイル・採用 seed は `tools/asset_spec.json` に集約。`assets/raw/_contact/` に目視確認用のコンタクトシートが出る。

## 構成

```
index.html            エントリ
src/main.js           ループ・シーン・入力・自動プレイ
src/game.js           ゲーム状態・ターン進行・フロア遷移
src/dungeon.js        フロア生成（3x2 セクション法）・オートタイル
src/fov.js            部屋全体 / 通路周囲1マスの視界
src/data/             items / monsters / spells / levels
src/systems/          combat / ai / inventory / spells
src/ui/               renderer / window / menu / input
src/assets.js         manifest ロードと仮ドット絵
tools/                Retro Diffusion クライアント・生成・シート化・検証
tests/test.html       ブラウザ内テスト
```
