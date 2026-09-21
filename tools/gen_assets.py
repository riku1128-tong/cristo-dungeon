"""Generate raw pixel-art assets declared in asset_spec.json via Retro Diffusion.

    python tools/gen_assets.py --dry-run            # cost estimate only (free)
    python tools/gen_assets.py --validate           # check styles/sizes against the live catalog
    python tools/gen_assets.py                      # generate everything not yet in assets/raw/
    python tools/gen_assets.py --only cristo slime  # generate selected ids (skips existing seeds)
    python tools/gen_assets.py --only cristo --force

Raw outputs land in assets/raw/<id>/seed_<n>.<png|gif> plus a .json with the API result metadata.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from rd_client import RDClient, RDError  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SPEC = ROOT / "tools" / "asset_spec.json"
RAW = ROOT / "assets" / "raw"


def load_spec() -> tuple[dict, list[dict]]:
    spec = json.loads(SPEC.read_text(encoding="utf-8"))
    assets = []
    for a in spec["assets"]:
        d = dict(spec["defaults"][a["kind"]])
        d.update(a)
        d["prompt"] = a["prompt"] + spec["style_suffix"].get(a["kind"], "")
        assets.append(d)
    return spec, assets


def payload_for(a: dict, seed: int) -> dict:
    p = {
        "prompt": a["prompt"],
        "prompt_style": a["style"],
        "width": a["width"],
        "height": a["height"],
        "num_images": 1,
        "seed": seed,
    }
    for k in ("remove_bg", "return_spritesheet", "tile_x", "tile_y", "bypass_prompt_expansion"):
        if k in a:
            p[k] = a[k]
    return p


def ext_for(data: bytes) -> str:
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if data[:2] == b"\xff\xd8":
        return "jpg"
    return "bin"


def raw_path(a: dict, seed: int) -> Path | None:
    d = RAW / a["id"]
    for ext in ("png", "gif", "jpg"):
        p = d / f"seed_{seed}.{ext}"
        if p.exists():
            return p
    return None


def cmd_validate(rd: RDClient, assets: list[dict]) -> int:
    cat = rd.styles()
    # The selector payload shape is not documented in detail; flatten anything that looks like a style entry.
    entries: dict[str, dict] = {}

    def walk(o):
        if isinstance(o, dict):
            sid = o.get("prompt_style") or o.get("id") or o.get("style_id")
            if isinstance(sid, str) and "min_width" in o:
                entries[sid] = o
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(cat)
    (RAW / "_styles_catalog.json").parent.mkdir(parents=True, exist_ok=True)
    (RAW / "_styles_catalog.json").write_text(json.dumps(cat, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"catalog: {len(entries)} styles (saved to assets/raw/_styles_catalog.json)")
    bad = 0
    for a in assets:
        e = entries.get(a["style"])
        if e is None:
            print(f"  ?? {a['id']}: style {a['style']} not found in catalog")
            bad += 1
            continue
        ok = e["min_width"] <= a["width"] <= e["max_width"] and e["min_height"] <= a["height"] <= e["max_height"]
        if not ok:
            bad += 1
        print(f"  {'ok' if ok else '!!'} {a['id']:<22} {a['style']:<36} {a['width']}x{a['height']}  "
              f"allowed {e['min_width']}-{e['max_width']} x {e['min_height']}-{e['max_height']}, batch<={e['max_number_of_images']}")
    return 1 if bad else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="estimate cost with check_cost (free)")
    ap.add_argument("--validate", action="store_true", help="check styles against live catalog")
    ap.add_argument("--only", nargs="*", default=None, help="asset ids to process")
    ap.add_argument("--force", action="store_true", help="regenerate even if raw exists")
    ap.add_argument("--seeds", nargs="*", type=int, default=None, help="restrict to these seed values")
    args = ap.parse_args()

    _, assets = load_spec()
    if args.only:
        missing = set(args.only) - {a["id"] for a in assets}
        if missing:
            print(f"unknown ids: {sorted(missing)}")
            return 1
        assets = [a for a in assets if a["id"] in args.only]

    rd = RDClient()
    if args.validate:
        return cmd_validate(rd, assets)

    jobs = []
    for a in assets:
        for seed in a["seeds"]:
            if args.seeds and seed not in args.seeds:
                continue
            if not args.force and raw_path(a, seed):
                continue
            jobs.append((a, seed))
    print(f"{len(jobs)} generation request(s) pending")
    if not jobs:
        return 0

    if args.dry_run:
        cache: dict[tuple, float] = {}
        total = 0.0
        for a, seed in jobs:
            key = (a["style"], a["width"], a["height"])
            if key not in cache:
                try:
                    res = rd.check_cost(**payload_for(a, seed))
                    cost = float(res.get("cost") or res.get("balance_cost") or res.get("estimated_cost") or 0)
                except RDError as e:
                    print(f"  check_cost failed for {key}: {e}")
                    cost = float("nan")
                cache[key] = cost
                print(f"  {key}: ${cost:.3f} per request")
            total += cache[key]
        print(f"estimated total: ${total:.2f}")
        print("balance:", json.dumps(rd.credits()))
        return 0

    failures = 0
    for i, (a, seed) in enumerate(jobs, 1):
        print(f"[{i}/{len(jobs)}] {a['id']} seed={seed}")
        try:
            images, result = rd.generate(**payload_for(a, seed))
        except RDError as e:
            print(f"  FAILED: {e}")
            failures += 1
            continue
        if not images:
            print("  FAILED: no images returned")
            failures += 1
            continue
        out_dir = RAW / a["id"]
        out_dir.mkdir(parents=True, exist_ok=True)
        for j, data in enumerate(images):
            suffix = "" if j == 0 else f"_{j}"
            (out_dir / f"seed_{seed}{suffix}.{ext_for(data)}").write_bytes(data)
        meta = {k: v for k, v in result.items() if k not in ("base64_images",)}
        meta["payload"] = payload_for(a, seed)
        (out_dir / f"seed_{seed}.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"done, {failures} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
