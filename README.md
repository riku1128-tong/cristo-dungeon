# クリフト ふしぎのダンジョン

SFC「トルネコの大冒険」風のブラウザ・ローグライク。主人公は DQ4 の神官クリフト。
B10F の「キラーピアス」を手に入れて地上へ帰還せよ。

- Vanilla JS (ES Modules) + Canvas、ビルド不要
- ドット絵は [Retro Diffusion](https://retrodiffusion.ai) API で生成し、`tools/` の Python パイプラインで SFC 風に整形

## 遊び方

```
python -m http.server 8000
# → http://localhost:8000/
```

## アセット生成

```
setx RD_API_KEY "rdpk-..."           # or tools/.env に RD_API_KEY=...
python tools/gen_assets.py --validate
python tools/gen_assets.py --dry-run  # 費用見積り
python tools/gen_assets.py            # 未生成分を生成 → assets/raw/
python tools/build_sheets.py          # シート化 → assets/{sprites,tiles,items} + manifest.json
```
