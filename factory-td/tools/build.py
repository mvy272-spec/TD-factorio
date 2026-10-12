#!/usr/bin/env python3
"""Сборка Factory Defense в один standalone HTML файл."""
import base64
import mimetypes
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "dist" / "factory-defense.html"


def inline_css_assets(css, css_path):
    """Инлайнит локальные CSS url(), оставляя data: и внешние URL нетронутыми."""
    pattern = re.compile(r'''url\(\s*(['"]?)(.*?)\1\s*\)''', re.IGNORECASE)

    def asset_repl(match):
        ref = match.group(2).strip()
        if not ref or ref.startswith(("data:", "http:", "https:", "//", "#")):
            return match.group(0)

        asset = (css_path.parent / ref).resolve()
        try:
            asset.relative_to(ROOT.resolve())
        except ValueError:
            raise SystemExit(f"ОШИБКА: CSS-ссылка выходит за пределы проекта: {ref}")
        if not asset.is_file():
            raise SystemExit(f"ОШИБКА: не найден CSS-ресурс: {ref} (из {css_path.relative_to(ROOT)})")

        mime = mimetypes.guess_type(asset.name)[0] or "application/octet-stream"
        payload = base64.b64encode(asset.read_bytes()).decode("ascii")
        return f"url('data:{mime};base64,{payload}')"

    return pattern.sub(asset_repl, css)


def main():
    html = (ROOT / "index.html").read_text(encoding="utf-8")

    # Инлайн CSS и локальных ресурсов, на которые он ссылается.
    def css_repl(match):
        href = match.group(1)
        css_path = ROOT / href
        css = css_path.read_text(encoding="utf-8")
        css = inline_css_assets(css, css_path)
        return "<style>\n/* ==== %s ==== */\n%s\n</style>" % (href, css)

    html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', css_repl, html)

    # Инлайн JavaScript.
    def js_repl(match):
        src = match.group(1)
        js = (ROOT / src).read_text(encoding="utf-8")
        return "<script>\n/* ==== %s ==== */\n%s\n</script>" % (src, js)

    html = re.sub(r'<script src="([^"]+)"></script>', js_repl, html)

    # Проверка внешних запросов.
    external = re.findall(r'(?:src|href)\s*=\s*"(https?:)?//[^"]+"', html)
    external += re.findall(r'url\(\s*[\'"]?(https?:)?//', html)
    if external:
        print("ОШИБКА: найдены внешние запросы:", external)
        sys.exit(1)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    kb = OUT.stat().st_size / 1024
    print(f"OK → {OUT} ({kb:.1f} KB), внешних запросов нет")


if __name__ == "__main__":
    main()
