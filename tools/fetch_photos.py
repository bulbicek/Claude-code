#!/usr/bin/env python3
"""Stiahne fotky politikov z Wikimedia Commons a zapíše autorov/licencie.

Použitie:  python3 tools/fetch_photos.py

Pre každého politika z app/src/main/assets/politicians/roster.json:
  1. zistí hlavný obrázok jeho článku (sk.wikipedia, potom en.wikipedia),
  2. prečíta licenciu a autora z Commons,
  3. stiahne obrázok len ak je licencia slobodná (CC / verejná doména),
  4. uloží <id>.jpg a credits.json do app/src/main/assets/politicians/.
Fotky s neslobodnou licenciou sa preskočia (hra použije náhradný portrét).
Používa len štandardnú knižnicu Pythonu.
"""
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIR = ROOT / "app/src/main/assets/politicians"
UA = "PolitPexeso/1.0 (hobby memory game; https://github.com/bulbicek/claude-code)"
WIDTH = 480
WIKIS = ["sk.wikipedia.org", "en.wikipedia.org"]
FREE = re.compile(r"^(CC[ -]|Public domain|PD|CC0)", re.I)


def api(host, **params):
    params.update(format="json", formatversion="2")
    url = f"https://{host}/w/api.php?" + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)
    return {}


def page_image(title):
    for host in WIKIS:
        d = api(host, action="query", titles=title, prop="pageimages", piprop="name", redirects="1")
        pages = d.get("query", {}).get("pages", [])
        if pages and pages[0].get("pageimage"):
            return pages[0]["pageimage"]
    return None


def image_info(filename):
    d = api("commons.wikimedia.org", action="query", titles="File:" + filename, prop="imageinfo",
            iiprop="url|extmetadata", iiurlwidth=str(WIDTH))
    pages = d.get("query", {}).get("pages", [])
    if not pages or "imageinfo" not in pages[0]:
        return None
    return pages[0]["imageinfo"][0]


def strip_html(s):
    return unescape(re.sub(r"<[^>]+>", "", s or "")).strip()


def download(url, dest):
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            dest.write_bytes(data)
            return
        except Exception:  # noqa: BLE001
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)


def main():
    roster = json.loads((DIR / "roster.json").read_text(encoding="utf-8"))
    credits, missing = {}, []
    for p in roster:
        fn = page_image(p["wiki"])
        info = image_info(fn) if fn else None
        if not info:
            missing.append((p["name"], "nenašiel sa obrázok"))
            continue
        meta = info.get("extmetadata", {})
        lic = strip_html(meta.get("LicenseShortName", {}).get("value", ""))
        if not FREE.match(lic):
            missing.append((p["name"], f"neslobodná/neznáma licencia: {lic or '?'}"))
            continue
        url = info.get("thumburl") or info["url"]
        download(url, DIR / f"{p['id']}.jpg")
        credits[p["id"]] = {
            "author": strip_html(meta.get("Artist", {}).get("value", "")) or "neznámy autor",
            "license": lic,
            "source": info.get("descriptionurl", ""),
        }
        print(f"OK   {p['name']:<24} {lic}")
        time.sleep(0.3)
    (DIR / "credits.json").write_text(json.dumps(credits, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nStiahnuté: {len(credits)}/{len(roster)}")
    for name, why in missing:
        print(f"CHÝBA {name}: {why}")
    return 0 if credits else 1


if __name__ == "__main__":
    sys.exit(main())
