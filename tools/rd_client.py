"""Minimal Retro Diffusion v2 API client (stdlib only).

Usage from other scripts:
    from rd_client import RDClient
    rd = RDClient()                       # reads RD_API_KEY env var
    rd.credits()                          # -> dict with balance
    rd.styles()                           # -> style catalog (size / batch limits)
    imgs = rd.generate(prompt="...", prompt_style="rd_plus__default", width=64, height=64)
    # imgs: list of bytes (PNG or GIF) ; use .check_cost(...) for a free dry run

CLI:
    python tools/rd_client.py credits
    python tools/rd_client.py styles [filter]
    python tools/rd_client.py status
"""
from __future__ import annotations

import base64
import json
import os
import sys
import time
import uuid
import urllib.error
import urllib.request

BASE = "https://api.retrodiffusion.ai/v2"


class RDError(RuntimeError):
    pass


def _dotenv_key() -> str | None:
    """Fallback: read RD_API_KEY from tools/.env (git-ignored)."""
    env = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if os.path.exists(env):
        with open(env, encoding="utf-8") as f:
            for line in f:
                k, _, v = line.strip().partition("=")
                if k == "RD_API_KEY" and v:
                    return v.strip().strip('"')
    return None


class RDClient:
    def __init__(self, api_key: str | None = None, verbose: bool = True):
        self.api_key = api_key or os.environ.get("RD_API_KEY") or _dotenv_key()
        if not self.api_key:
            raise RDError("RD_API_KEY is not set (setx RD_API_KEY \"rdpk-...\" then reopen the terminal)")
        self.verbose = verbose

    # ---- low level -------------------------------------------------------
    def _req(self, method: str, path: str, body: dict | None = None, extra_headers: dict | None = None,
             retries: int = 4) -> dict:
        url = BASE + path
        data = json.dumps(body).encode() if body is not None else None
        headers = {"X-RD-Token": self.api_key, "Accept": "application/json"}
        if data is not None:
            headers["Content-Type"] = "application/json"
        if extra_headers:
            headers.update(extra_headers)
        last_err = None
        for attempt in range(retries):
            req = urllib.request.Request(url, data=data, method=method, headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=120) as resp:
                    raw = resp.read()
                    return json.loads(raw) if raw else {}
            except urllib.error.HTTPError as e:
                raw = e.read().decode(errors="replace")
                # 429 / 5xx: back off and retry, everything else is fatal
                if e.code == 429 or e.code >= 500:
                    last_err = RDError(f"HTTP {e.code} on {method} {path}: {raw[:300]}")
                    time.sleep(2 * (attempt + 1))
                    continue
                raise RDError(f"HTTP {e.code} on {method} {path}: {raw[:500]}") from None
            except urllib.error.URLError as e:
                last_err = RDError(f"network error on {method} {path}: {e}")
                time.sleep(2 * (attempt + 1))
        raise last_err  # type: ignore[misc]

    # ---- public API ------------------------------------------------------
    def status(self) -> dict:
        return self._req("GET", "/status")

    def credits(self) -> dict:
        return self._req("GET", "/inferences/credits")

    def styles(self) -> dict:
        return self._req("GET", "/styles/selector")

    def check_cost(self, **payload) -> dict:
        payload["check_cost"] = True
        payload.pop("async", None)
        return self._req("POST", "/inferences", payload)  # dry run is sync: no Idempotency-Key

    def submit(self, **payload) -> str:
        """Submit a generation job, return task_id."""
        payload.pop("check_cost", None)
        payload["async"] = True  # required when sending an Idempotency-Key
        res = self._req("POST", "/inferences", payload, {"Idempotency-Key": str(uuid.uuid4())})
        task_id = res.get("task_id") or res.get("id")
        if not task_id:
            raise RDError(f"no task_id in response: {json.dumps(res)[:500]}")
        return task_id

    def wait(self, task_id: str, poll: float = 2.5, timeout: float = 600) -> dict:
        t0 = time.time()
        while True:
            task = self._req("GET", f"/inferences/tasks/{task_id}")
            st = task.get("status")
            if st in ("pending", "running", "queued", "processing"):
                if time.time() - t0 > timeout:
                    raise RDError(f"task {task_id} timed out after {timeout}s")
                time.sleep(poll)
                continue
            if st == "succeeded":
                return task.get("result") or task
            raise RDError(f"task {task_id} failed: {json.dumps(task.get('error') or task)[:500]}")

    def generate(self, **payload) -> tuple[list[bytes], dict]:
        """Submit + wait. Returns (list of image bytes, raw result dict)."""
        task_id = self.submit(**payload)
        if self.verbose:
            print(f"    task {task_id} submitted ({payload.get('prompt_style')} {payload.get('width')}x{payload.get('height')})")
        result = self.wait(task_id)
        images: list[bytes] = [base64.b64decode(b) for b in result.get("base64_images") or []]
        for url in result.get("output_urls") or []:
            with urllib.request.urlopen(url, timeout=120) as resp:
                images.append(resp.read())
        if self.verbose:
            print(f"    done: {len(images)} image(s), cost ${result.get('balance_cost')}, "
                  f"balance ${result.get('remaining_balance')}")
        return images, result

    def edit_tool(self, tool_id: str, **payload) -> tuple[list[bytes], dict]:
        res = self._req("POST", f"/edit/tools/{tool_id}", payload, {"Idempotency-Key": str(uuid.uuid4())})
        task_id = res.get("task_id")
        result = self.wait(task_id) if task_id else res
        images = [base64.b64decode(b) for b in result.get("base64_images") or []]
        for url in result.get("output_urls") or []:
            with urllib.request.urlopen(url, timeout=120) as resp:
                images.append(resp.read())
        return images, result


def b64file(path: str) -> str:
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 1
    cmd = argv[0]
    rd = RDClient()
    if cmd == "credits":
        print(json.dumps(rd.credits(), indent=2))
    elif cmd == "status":
        print(json.dumps(rd.status(), indent=2))
    elif cmd == "styles":
        data = rd.styles()
        text = json.dumps(data, indent=2, ensure_ascii=False)
        if len(argv) > 1:
            # crude filter: print only lines (with context) mentioning the keyword
            key = argv[1].lower()
            print("\n".join(l for l in text.splitlines() if key in l.lower()))
        else:
            print(text)
    else:
        print(f"unknown command {cmd}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
