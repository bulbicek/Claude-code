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
import urllib.error
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


def fetch(url, timeout):
    """GET s trpezlivým opakovaním pri 429/5xx (Wikimedia rate limit)."""
    for attempt in range(7):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503, 504) or attempt == 6:
                raise
            wait = e.headers.get("Retry-After")
            time.sleep(int(wait) if wait and wait.isdigit() else 5 * 2 ** attempt)
        except OSError:
            if attempt == 6:
                raise
            time.sleep(3 * 2 ** attempt)


def api(host, **params):
    params.update(format="json", formatversion="2")
    return json.loads(fetch(f"https://{host}/w/api.php?" + urllib.parse.urlencode(params), 30))


def page_images(titles):
    """Dávkovo: {pôvodný názov: názov súboru hlavného obrázka} (sk, potom en wiki)."""
    result = {}
    for host in WIKIS:
        todo = [t for t in titles if t not in result]
        if not todo:
            break
        d = api(host, action="query", titles="|".join(todo), prop="pageimages", piprop="name", redirects="1")
        q = d.get("query", {})
        alias = {}
        for key in ("normalized", "redirects"):
            for m in q.get(key, []):
                alias[m["from"]] = m["to"]
        by_title = {pg["title"]: pg.get("pageimage") for pg in q.get("pages", [])}
        for t in todo:
            cur = t
            for _ in range(3):
                cur = alias.get(cur, cur)
            if by_title.get(cur):
                result[t] = by_title[cur]
    return result


def image_infos(filenames):
    """Dávkovo: {názov súboru: imageinfo} z Commons."""
    out = {}
    names = sorted(set(filenames))
    for i in range(0, len(names), 20):
        chunk = names[i:i + 20]
        d = api("commons.wikimedia.org", action="query", titles="|".join("File:" + n for n in chunk),
                prop="imageinfo", iiprop="url|extmetadata", iiurlwidth=str(WIDTH))
        q = d.get("query", {})
        alias = {m["from"]: m["to"] for k in ("normalized", "redirects") for m in q.get(k, [])}
        by_title = {pg["title"]: pg for pg in q.get("pages", []) if "imageinfo" in pg}
        for n in chunk:
            t = alias.get("File:" + n, "File:" + n)
            if t in by_title:
                out[n] = by_title[t]["imageinfo"][0]
    return out


def strip_html(s):
    return unescape(re.sub(r"<[^>]+>", "", s or "")).strip()


def download(url, dest):
    dest.write_bytes(fetch(url, 60))


def main():
    roster = json.loads((DIR / "roster.json").read_text(encoding="utf-8"))
    cred_path = DIR / "credits.json"
    credits = json.loads(cred_path.read_text(encoding="utf-8")) if cred_path.exists() else {}
    # obnoviteľné: už stiahnutých preskočí
    credits = {k: v for k, v in credits.items() if (DIR / f"{k}.jpg").exists()}
    todo = [p for p in roster if p["id"] not in credits]
    files = page_images([p["wiki"] for p in todo])
    infos = image_infos(files.values())
    missing = []
    for p in todo:
        fn = files.get(p["wiki"])
        info = infos.get(fn) if fn else None
        if not info:
            missing.append((p["name"], "nenašiel sa obrázok"))
            continue
        meta = info.get("extmetadata", {})
        lic = strip_html(meta.get("LicenseShortName", {}).get("value", ""))
        if not FREE.match(lic):
            missing.append((p["name"], f"neslobodná/neznáma licencia: {lic or '?'}"))
            continue
        orig = info["url"]
        thumb = info.get("thumburl") or orig
        if "//upload.wikimedia.org/wikipedia/commons/" in orig and "/thumb/" not in orig:
            # náhľad priamo z upload.wikimedia.org (thumb.wikimedia.org nemusí byť dostupný)
            head, tail = orig.split("/wikipedia/commons/", 1)
            name = tail.rsplit("/", 1)[1]
            thumb = f"{head}/wikipedia/commons/thumb/{tail}/{WIDTH}px-{name}"
        try:
            download(thumb, DIR / f"{p['id']}.jpg")
        except OSError:
            download(orig, DIR / f"{p['id']}.jpg")
        credits[p["id"]] = {
            "author": strip_html(meta.get("Artist", {}).get("value", "")) or "neznámy autor",
            "license": lic,
            "source": info.get("descriptionurl", ""),
        }
        cred_path.write_text(json.dumps(credits, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"OK   {p['name']:<24} {lic}", flush=True)
        time.sleep(1.5)
    print(f"\nStiahnuté: {len(credits)}/{len(roster)}")
    for name, why in missing:
        print(f"CHÝBA {name}: {why}")
    return 0 if credits else 1


if __name__ == "__main__":
    sys.exit(main())
