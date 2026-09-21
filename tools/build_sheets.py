"""Turn raw Retro Diffusion outputs (assets/raw) into game-ready sheets + manifest.

    python tools/build_sheets.py                # build everything that has raw data
    python tools/build_sheets.py --contact      # only write review contact sheets (assets/raw/_contact)
    python tools/build_sheets.py --only cristo

Per kind:
  character : GIF / spritesheet PNG -> 4 rows (down,left,right,up) x N frames, 48x48 cells,
              background keyed out, feet aligned on a common baseline, quantized to 15 colours.
  tileset   : sliced on a 32px grid; the cells named in spec "tiles" are copied into assets/tiles/<id>.png
  object/item: single PNG -> (k-centroid downscale) -> trimmed & centred in 32x32 -> quantized.
              Items are packed into assets/items/atlas.png.

Everything the game needs to know is written to assets/manifest.json.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

from PIL import Image, ImageDraw, ImageSequence

ROOT = Path(__file__).resolve().parent.parent
SPEC = ROOT / "tools" / "asset_spec.json"
RAW = ROOT / "assets" / "raw"
CONTACT = RAW / "_contact"
OUT_SPRITES = ROOT / "assets" / "sprites"
OUT_TILES = ROOT / "assets" / "tiles"
OUT_ITEMS = ROOT / "assets" / "items"
MANIFEST = ROOT / "assets" / "manifest.json"

CELL = 48
TILE = 32
DIRS = ["down", "left", "right", "up"]
MAX_COLOURS = 15


# ---------------------------------------------------------------- helpers
def load_spec() -> list[dict]:
    spec = json.loads(SPEC.read_text(encoding="utf-8"))
    out = []
    for a in spec["assets"]:
        d = dict(spec["defaults"][a["kind"]])
        d.update(a)
        out.append(d)
    return out


def raw_files(a: dict) -> list[tuple[int, Path]]:
    d = RAW / a["id"]
    found = []
    for seed in a["seeds"]:
        for ext in ("png", "gif"):
            p = d / f"seed_{seed}.{ext}"
            if p.exists():
                found.append((seed, p))
                break
    return found


def picked(a: dict, files: list[tuple[int, Path]]) -> Path:
    pick = a.get("pick")
    if pick is not None:
        for seed, p in files:
            if seed == pick:
                return p
        print(f"  warning: pick={pick} not found for {a['id']}, using first")
    return files[0][1]


def key_background(img: Image.Image, tol: int = 28) -> Image.Image:
    """Return RGBA with the background made transparent.

    If the image already carries real transparency we trust it. Otherwise flood-fill
    from the four corners (background colour = most common corner colour)."""
    img = img.convert("RGBA")
    alpha = img.getchannel("A")
    if alpha.getextrema()[0] < 255:
        return img
    w, h = img.size
    px = img.load()
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    bg = Counter(c[:3] for c in corners).most_common(1)[0][0]

    def near(c):
        return abs(c[0] - bg[0]) + abs(c[1] - bg[1]) + abs(c[2] - bg[2]) <= tol

    seen = bytearray(w * h)
    stack = [(x, y) for (x, y) in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)) if near(px[x, y])]
    while stack:
        x, y = stack.pop()
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        if not near(px[x, y]):
            continue
        px[x, y] = (0, 0, 0, 0)
        if x > 0: stack.append((x - 1, y))
        if x < w - 1: stack.append((x + 1, y))
        if y > 0: stack.append((x, y - 1))
        if y < h - 1: stack.append((x, y + 1))
    return img


def quantize_group(frames: list[Image.Image], colours: int = MAX_COLOURS) -> list[Image.Image]:
    """Quantize several RGBA frames with ONE shared palette (keeps animation colours stable)."""
    if not frames:
        return frames
    w = max(f.width for f in frames)
    strip = Image.new("RGBA", (w * len(frames), max(f.height for f in frames)), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        strip.paste(f, (i * w, 0))
    mask = strip.getchannel("A").point(lambda v: 255 if v > 127 else 0)
    rgb = strip.convert("RGB")
    # ignore transparent pixels when building the palette: paint them with the most common opaque colour
    opaque = [c for c, m in zip(rgb.getdata(), mask.getdata()) if m]
    if not opaque:
        return frames
    fill = Counter(opaque).most_common(1)[0][0]
    solid = Image.new("RGB", rgb.size, fill)
    solid.paste(rgb, (0, 0), mask)
    q = solid.quantize(colors=colours, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGBA")
    q.putalpha(mask)
    out = []
    for i, f in enumerate(frames):
        out.append(q.crop((i * w, 0, i * w + f.width, f.height)))
    return out


def k_centroid_downscale(img: Image.Image, factor: int) -> Image.Image:
    """Nearest-neighbour is noisy on AI pixel art; pick the dominant colour of each block instead
    (a cheap stand-in for Retro Diffusion's k-centroid). Alpha uses majority vote."""
    img = img.convert("RGBA")
    w, h = img.width // factor, img.height // factor
    src = img.load()
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    dst = out.load()
    for y in range(h):
        for x in range(w):
            block = [src[x * factor + i, y * factor + j] for j in range(factor) for i in range(factor)]
            opaque = [p for p in block if p[3] > 127]
            if len(opaque) * 2 < len(block):
                continue
            # 2-means on colour, then centroid snapped to a real pixel of the bigger cluster
            best = Counter(p[:3] for p in opaque).most_common(1)[0][0]
            if len(set(p[:3] for p in opaque)) > 1:
                c1 = best
                far = max(opaque, key=lambda p: sum(abs(p[k] - c1[k]) for k in range(3)))[:3]
                for _ in range(3):
                    g1 = [p for p in opaque if sum(abs(p[k] - c1[k]) for k in range(3)) <= sum(abs(p[k] - far[k]) for k in range(3))]
                    g2 = [p for p in opaque if p not in g1]
                    if not g2:
                        break
                    c1 = tuple(sum(p[k] for p in g1) // len(g1) for k in range(3))
                    far = tuple(sum(p[k] for p in g2) // len(g2) for k in range(3))
                big = g1 if len(g1) >= len(g2) else g2
                cen = c1 if big is g1 else far
                best = min(big, key=lambda p: sum(abs(p[k] - cen[k]) for k in range(3)))[:3]
            dst[x, y] = (*best, 255)
    return out


def fit_into(img: Image.Image, size: int, anchor: str = "center") -> Image.Image:
    """Trim transparent border and place into a size x size cell (anchor: center|bottom)."""
    bbox = img.getbbox()
    if bbox is None:
        return Image.new("RGBA", (size, size), (0, 0, 0, 0))
    crop = img.crop(bbox)
    if crop.width > size or crop.height > size:
        s = min(size / crop.width, size / crop.height)
        crop = crop.resize((max(1, int(crop.width * s)), max(1, int(crop.height * s))), Image.Resampling.NEAREST)
    cell = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    x = (size - crop.width) // 2
    y = (size - crop.height) // 2 if anchor == "center" else size - crop.height
    cell.paste(crop, (x, y))
    return cell


def label(img: Image.Image, text: str) -> Image.Image:
    box = Image.new("RGBA", (img.width, img.height + 12), (40, 40, 40, 255))
    box.paste(img, (0, 12))
    ImageDraw.Draw(box).text((2, 0), text, fill=(255, 255, 255, 255))
    return box


def contact_sheet(name: str, tiles: list[tuple[str, Image.Image]], scale: int = 3, cols: int = 4):
    CONTACT.mkdir(parents=True, exist_ok=True)
    cells = []
    for t, im in tiles:
        im = im.convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 0, 255, 255))  # magenta shows transparency
        bg.alpha_composite(im)
        cells.append(label(bg.resize((im.width * scale, im.height * scale), Image.Resampling.NEAREST), t))
    cw = max(c.width for c in cells)
    ch = max(c.height for c in cells)
    rows = (len(cells) + cols - 1) // cols
    sheet = Image.new("RGBA", (cw * cols, ch * rows), (20, 20, 20, 255))
    for i, c in enumerate(cells):
        sheet.paste(c, ((i % cols) * cw, (i // cols) * ch))
    sheet.save(CONTACT / f"{name}.png")


# ---------------------------------------------------------------- characters
def load_frames(path: Path, cell: int = CELL) -> list[Image.Image]:
    im = Image.open(path)
    if path.suffix.lower() == ".gif":
        frames = []
        for fr in ImageSequence.Iterator(im):
            frames.append(fr.convert("RGBA").copy())
        return frames
    im = im.convert("RGBA")
    if im.width == cell and im.height == cell:
        return [im]
    cols, rows = im.width // cell, im.height // cell
    return [im.crop((c * cell, r * cell, (c + 1) * cell, (r + 1) * cell)) for r in range(rows) for c in range(cols)]


def split_directions(frames: list[Image.Image], a: dict) -> dict[str, list[Image.Image]]:
    """Map the flat frame list onto direction rows.

    spec "layout": {"order": ["down","left","right","up"], "frames": N, "mode": "rows"|"interleaved"}
    Default: 4 equal consecutive groups in order down,left,right,up."""
    lay = a.get("layout") or {}
    order = lay.get("order") or DIRS
    n = lay.get("frames") or max(1, len(frames) // len(order))
    mode = lay.get("mode", "rows")
    out: dict[str, list[Image.Image]] = {}
    for i, d in enumerate(order):
        if mode == "interleaved":
            out[d] = frames[i::len(order)][:n]
        else:
            out[d] = frames[i * n:(i + 1) * n]
    # fill missing directions by mirroring / reuse so the game never lacks a row
    if "right" in out and "left" not in out:
        out["left"] = [f.transpose(Image.Transpose.FLIP_LEFT_RIGHT) for f in out["right"]]
    if "left" in out and "right" not in out:
        out["right"] = [f.transpose(Image.Transpose.FLIP_LEFT_RIGHT) for f in out["left"]]
    for d in DIRS:
        if not out.get(d):
            out[d] = out.get("down") or frames[:n]
    if lay.get("mirror_right_from_left"):
        out["right"] = [f.transpose(Image.Transpose.FLIP_LEFT_RIGHT) for f in out["left"]]
    return out


def align_row(frames: list[Image.Image], cell: int = CELL, baseline: int | None = None) -> list[Image.Image]:
    boxes = [f.getbbox() or (0, 0, cell, cell) for f in frames]
    bottom = baseline if baseline is not None else max(b[3] for b in boxes)
    bottom = min(bottom, cell)
    cx = sum((b[0] + b[2]) / 2 for b in boxes) / len(boxes)
    dx = round(cell / 2 - cx)
    out = []
    for f, b in zip(frames, boxes):
        dy = bottom - b[3]
        cell_img = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
        cell_img.paste(f, (dx, dy))
        out.append(cell_img)
    return out


def build_character(a: dict, files: list[tuple[int, Path]], manifest: dict, contact_only: bool):
    # contact sheet of every seed: first frame of each direction group
    tiles = []
    for seed, p in files:
        frames = load_frames(p)
        dirs = split_directions(frames, a)
        for d in DIRS:
            for i, f in enumerate(dirs[d][:2]):
                tiles.append((f"{seed} {d}{i} ({len(frames)}f)", key_background(f)))
    contact_sheet(a["id"], tiles, cols=8)
    if contact_only:
        return
    path = picked(a, files)
    frames = [key_background(f) for f in load_frames(path)]
    dirs = split_directions(frames, a)
    n = max(len(dirs[d]) for d in DIRS)
    # common baseline across all directions so the sprite doesn't bob when turning
    base = max((f.getbbox() or (0, 0, 0, CELL))[3] for d in DIRS for f in dirs[d])
    base = min(CELL, max(base, CELL - 2)) if a.get("anchor_bottom", True) else base
    rows = {d: align_row(dirs[d], baseline=base) for d in DIRS}
    all_frames = [f for d in DIRS for f in rows[d]]
    q = quantize_group(all_frames, a.get("colours", MAX_COLOURS))
    sheet = Image.new("RGBA", (CELL * n, CELL * 4), (0, 0, 0, 0))
    k = 0
    for r, d in enumerate(DIRS):
        for c in range(len(rows[d])):
            sheet.paste(q[k], (c * CELL, r * CELL))
            k += 1
    OUT_SPRITES.mkdir(parents=True, exist_ok=True)
    out = OUT_SPRITES / f"{a['id']}.png"
    sheet.save(out)
    manifest["sprites"][a["id"]] = {
        "file": f"assets/sprites/{a['id']}.png", "cell": CELL, "frames": n, "dirs": DIRS,
        "source": str(path.relative_to(ROOT)).replace("\\", "/"),
    }
    print(f"  sprite {a['id']}: {n} frames x 4 dirs from {path.name}")


def build_static(a: dict, files: list[tuple[int, Path]], manifest: dict, contact_only: bool):
    """One generated frame used for every direction (blob monsters); the game animates it by bouncing."""
    contact_sheet(a["id"], [(f"{seed}", key_background(Image.open(p))) for seed, p in files], cols=8)
    if contact_only:
        return
    path = picked(a, files)
    frame = fit_into(key_background(Image.open(path)), CELL, anchor="bottom")
    frame = quantize_group([frame], a.get("colours", MAX_COLOURS))[0]
    sheet = Image.new("RGBA", (CELL, CELL * 4), (0, 0, 0, 0))
    for r in range(4):
        sheet.paste(frame, (0, r * CELL))
    OUT_SPRITES.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT_SPRITES / f"{a['id']}.png")
    manifest["sprites"][a["id"]] = {
        "file": f"assets/sprites/{a['id']}.png", "cell": CELL, "frames": 1, "dirs": DIRS, "bounce": True,
        "source": str(path.relative_to(ROOT)).replace("\\", "/"),
    }
    print(f"  static {a['id']} from {path.name}")


# ---------------------------------------------------------------- tilesets
def build_tileset(a: dict, files: list[tuple[int, Path]], manifest: dict, contact_only: bool):
    for seed, p in files:
        im = Image.open(p).convert("RGBA")
        cols, rows = im.width // TILE, im.height // TILE
        grid = im.resize((im.width * 3, im.height * 3), Image.Resampling.NEAREST)
        d = ImageDraw.Draw(grid)
        for c in range(cols):
            for r in range(rows):
                d.rectangle((c * TILE * 3, r * TILE * 3, (c + 1) * TILE * 3 - 1, (r + 1) * TILE * 3 - 1), outline=(255, 0, 255, 160))
                d.text((c * TILE * 3 + 2, r * TILE * 3 + 2), f"{c},{r}", fill=(255, 255, 0, 255))
        CONTACT.mkdir(parents=True, exist_ok=True)
        grid.save(CONTACT / f"{a['id']}_seed{seed}.png")
    if contact_only:
        return
    names = a.get("tiles")
    if not names:
        print(f"  tileset {a['id']}: no 'tiles' mapping in spec yet -> review assets/raw/_contact/{a['id']}_seed*.png")
        return
    path = picked(a, files)
    im = Image.open(path).convert("RGBA")
    order = list(names.keys())
    sheet = Image.new("RGBA", (TILE * len(order), TILE), (0, 0, 0, 0))
    for i, name in enumerate(order):
        c, r = names[name]
        sheet.paste(im.crop((c * TILE, r * TILE, (c + 1) * TILE, (r + 1) * TILE)), (i * TILE, 0))
    OUT_TILES.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT_TILES / f"{a['id']}.png")
    manifest["tilesets"][a["id"]] = {"file": f"assets/tiles/{a['id']}.png", "tile": TILE, "names": order}
    print(f"  tileset {a['id']}: {len(order)} tiles")


# ---------------------------------------------------------------- items / objects
def build_single(a: dict, files: list[tuple[int, Path]]) -> Image.Image:
    path = picked(a, files)
    im = key_background(Image.open(path))
    ds = (a.get("post") or {}).get("downscale")
    if ds and im.width > ds:
        im = k_centroid_downscale(im, im.width // ds)
    cell = fit_into(im, TILE, anchor="center")
    return quantize_group([cell], a.get("colours", MAX_COLOURS))[0]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--contact", action="store_true", help="only write contact sheets for review")
    ap.add_argument("--only", nargs="*", default=None)
    args = ap.parse_args()

    assets = load_spec()
    if args.only:
        assets = [a for a in assets if a["id"] in args.only]

    manifest = {"sprites": {}, "tilesets": {}, "objects": {}, "items": {}}
    if MANIFEST.exists():
        try:
            old = json.loads(MANIFEST.read_text(encoding="utf-8"))
            for k in manifest:
                # 出力ファイルが消えている古いエントリは捨てる
                manifest[k].update({i: v for i, v in old.get(k, {}).items() if (ROOT / v["file"]).exists()})
        except json.JSONDecodeError:
            pass

    singles: dict[str, tuple[str, Image.Image]] = {}
    contact_items = []
    for a in assets:
        files = raw_files(a)
        if not files:
            continue
        print(f"{a['id']} ({a['kind']}, {len(files)} raw)")
        if a["kind"] == "character":
            build_character(a, files, manifest, args.contact)
        elif a["kind"] == "static":
            build_static(a, files, manifest, args.contact)
        elif a["kind"] == "tileset":
            build_tileset(a, files, manifest, args.contact)
        else:
            for seed, p in files:
                contact_items.append((f"{a['id']} {seed}", key_background(Image.open(p))))
            if not args.contact:
                singles[a["id"]] = (a["kind"], build_single(a, files))
    if contact_items:
        contact_sheet("items", contact_items, scale=2, cols=8)
    if args.contact:
        print(f"contact sheets written to {CONTACT}")
        return 0

    if singles:
        # objects as individual files, items into one atlas (8 columns)
        OUT_ITEMS.mkdir(parents=True, exist_ok=True)
        OUT_TILES.mkdir(parents=True, exist_ok=True)
        item_ids = sorted(k for k, (kind, _) in singles.items() if kind == "item")
        prev = manifest["items"]
        # keep atlas stable: reuse previous slots, append new ones
        slots = {k: v["index"] for k, v in prev.items() if "index" in v}
        # rebuild atlas from existing atlas + new singles
        atlas_old = Image.open(OUT_ITEMS / "atlas.png").convert("RGBA") if (OUT_ITEMS / "atlas.png").exists() else None
        for k in item_ids:
            if k not in slots:
                slots[k] = max(slots.values(), default=-1) + 1
        n = max(slots.values()) + 1
        cols = 8
        atlas = Image.new("RGBA", (TILE * cols, TILE * ((n + cols - 1) // cols)), (0, 0, 0, 0))
        for k, idx in slots.items():
            x, y = (idx % cols) * TILE, (idx // cols) * TILE
            if k in singles:
                atlas.paste(singles[k][1], (x, y))
            elif atlas_old is not None:
                atlas.paste(atlas_old.crop((x, y, x + TILE, y + TILE)), (x, y))
            manifest["items"][k] = {"file": "assets/items/atlas.png", "index": idx, "x": x, "y": y, "size": TILE}
        atlas.save(OUT_ITEMS / "atlas.png")
        print(f"  items atlas: {n} slots")
        for k, (kind, im) in singles.items():
            if kind == "object":
                im.save(OUT_TILES / f"{k}.png")
                manifest["objects"][k] = {"file": f"assets/tiles/{k}.png", "size": TILE}
                print(f"  object {k}")

    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"manifest written: {MANIFEST}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
