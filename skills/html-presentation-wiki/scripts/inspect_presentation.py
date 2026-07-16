#!/usr/bin/env python3
"""Inspect an HTML presentation file before publishing it to a wiki.

Prints a JSON report to stdout:
  framework      detected presentation framework
  title          <title> or first heading
  slide_count    best-effort slide count for the detected framework
  size_bytes     file size
  external_refs  absolute http(s) resources (fine when viewed online)
  local_refs     relative src/href resources that break on single-file upload
  warnings       human-readable warnings

Exit codes: 0 ok, 1 usage/read error, 2 local refs found (deck would break).
Use --force to downgrade exit code 2 to 0.
"""

import argparse
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

WARN_SIZE = 10 * 1024 * 1024
MAX_SIZE = 100 * 1024 * 1024

# (framework, regex on full document)
FRAMEWORK_SIGNATURES = [
    ("reveal.js", re.compile(r"class=[\"'][^\"']*\breveal\b|Reveal\.initialize", re.I)),
    ("impress.js", re.compile(r"id=[\"']impress[\"']|impress\(\)\.init", re.I)),
    ("marp", re.compile(r"marpit|data-marpit|class=[\"'][^\"']*\bmarp\b", re.I)),
    ("deck.js", re.compile(r"class=[\"'][^\"']*\bdeck-container\b", re.I)),
    ("shower", re.compile(r"class=[\"'][^\"']*\bshower\b", re.I)),
]

SKIP_SCHEMES = ("http://", "https://", "//", "data:", "mailto:", "tel:",
                "javascript:", "about:", "blob:")

REF_ATTRS = {"src", "href", "data-src", "data-background-image",
             "data-background-video", "data-background-iframe", "poster"}


class RefCollector(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.external = []
        self.local = []
        self.title_parts = []
        self.headings = []
        self._in_title = False
        self._heading_tag = None
        self._heading_parts = []
        self.slide_tags = {"section": 0}
        self.step_classes = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "title":
            self._in_title = True
        if tag in ("h1", "h2") and not self.headings:
            self._heading_tag = tag
            self._heading_parts = []
        if tag == "section":
            self.slide_tags["section"] += 1
        classes = (attrs.get("class") or "").split()
        if "step" in classes or "slide" in classes:
            self.step_classes += 1
        for attr in REF_ATTRS:
            val = (attrs.get(attr) or "").strip()
            if not val or val.startswith("#"):
                continue
            if val.lower().startswith(SKIP_SCHEMES):
                if val.lower().startswith(("http://", "https://", "//")):
                    self.external.append(val)
            else:
                self.local.append(val)
        style = attrs.get("style") or ""
        for url in re.findall(r"url\(\s*['\"]?([^'\")]+)", style):
            u = url.strip()
            if u.lower().startswith(SKIP_SCHEMES) or u.startswith("#"):
                continue
            self.local.append(u)

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        if tag == self._heading_tag:
            text = "".join(self._heading_parts).strip()
            if text:
                self.headings.append(text)
            self._heading_tag = None

    def handle_data(self, data):
        if self._in_title:
            self.title_parts.append(data)
        if self._heading_tag:
            self._heading_parts.append(data)


def detect_framework(html: str) -> str:
    for name, sig in FRAMEWORK_SIGNATURES:
        if sig.search(html):
            return name
    return "generic-html"


def count_slides(framework: str, html: str, collector: RefCollector) -> int:
    if framework == "reveal.js":
        m = re.search(r"class=[\"'][^\"']*\bslides\b[^\"']*[\"']", html)
        if m:
            # top-level <section> inside .slides; nested sections are vertical
            # stacks, so plain count is an upper bound — good enough.
            return collector.slide_tags["section"]
    if framework == "impress.js":
        return collector.step_classes
    return max(collector.slide_tags["section"], collector.step_classes)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("file", help="HTML presentation file")
    ap.add_argument("--force", action="store_true",
                    help="exit 0 even when local file references are found")
    args = ap.parse_args()

    path = Path(args.file)
    try:
        html = path.read_text(encoding="utf-8", errors="replace")
    except OSError as e:
        print(f"error: cannot read {path}: {e}", file=sys.stderr)
        return 1

    collector = RefCollector()
    collector.feed(html)

    framework = detect_framework(html)
    title = "".join(collector.title_parts).strip() or (
        collector.headings[0] if collector.headings else path.stem)
    size = path.stat().st_size

    # CSS url(...) references inside <style> blocks
    for url in re.findall(r"url\(\s*['\"]?([^'\")]+)", html):
        u = url.strip()
        if not u or u.startswith("#") or u.lower().startswith(SKIP_SCHEMES):
            continue
        if u not in collector.local:
            collector.local.append(u)

    local_refs = sorted(set(collector.local))
    external_refs = sorted(set(collector.external))

    warnings = []
    if size > MAX_SIZE:
        warnings.append(
            f"File is {size / 1024 / 1024:.1f} MB — GitHub rejects files over 100 MB.")
    elif size > WARN_SIZE:
        warnings.append(
            f"File is {size / 1024 / 1024:.1f} MB — viewer links will load slowly; "
            "consider compressing embedded images.")
    if local_refs:
        warnings.append(
            "Local file references found — these will 404 after single-file "
            "upload. Inline them or export a self-contained file.")
    if framework == "generic-html":
        warnings.append(
            "No known presentation framework detected; publishing anyway is "
            "fine if this is intentionally a plain HTML page.")

    report = {
        "file": str(path),
        "framework": framework,
        "title": title,
        "slide_count": count_slides(framework, html, collector),
        "size_bytes": size,
        "external_refs": external_refs,
        "local_refs": local_refs,
        "warnings": warnings,
    }
    json.dump(report, sys.stdout, indent=2, ensure_ascii=False)
    print()

    if local_refs and not args.force:
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
