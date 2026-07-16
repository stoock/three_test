#!/usr/bin/env python3
"""Generate/update wiki pages for a published HTML presentation.

Given a cloned wiki working tree that already contains
presentations/<slug>.html, this script:

  1. writes <Page-Name>.md — the per-presentation page (from the template in
     ../assets/page-template.md), with viewer/download links and metadata
  2. rewrites the block between the markers in Presentations.md — the index —
     keeping one row per presentation, sorted by most recently updated

Called by publish_to_wiki.sh; can also be run standalone inside a wiki clone.
"""

import argparse
import datetime
import json
import re
import sys
from pathlib import Path
from urllib.parse import quote

MARK_BEGIN = "<!-- presentations:begin -->"
MARK_END = "<!-- presentations:end -->"
INDEX_PAGE = "Presentations.md"
META_FILE = "presentations/.index.json"

TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "assets" / "page-template.md"


def slugify(text: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", text, flags=re.UNICODE).strip()
    slug = re.sub(r"[\s_]+", "-", slug)
    return slug.strip("-") or "presentation"


def viewer_links(repo: str, rel_path: str, private: bool) -> dict:
    enc = quote(rel_path, safe="/")
    raw = f"https://raw.githubusercontent.com/wiki/{repo}/{enc}"
    if private:
        return {"raw": raw}
    return {
        "raw": raw,
        "htmlpreview": f"https://htmlpreview.github.io/?{raw}",
        "githack": f"https://rawcdn.githack.com/wiki/{repo}/{enc}",
    }


def load_meta(wiki_dir: Path) -> list:
    meta = wiki_dir / META_FILE
    if meta.exists():
        try:
            return json.loads(meta.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            pass
    return []


def save_meta(wiki_dir: Path, entries: list) -> None:
    meta = wiki_dir / META_FILE
    meta.parent.mkdir(parents=True, exist_ok=True)
    meta.write_text(json.dumps(entries, indent=2, ensure_ascii=False) + "\n",
                    encoding="utf-8")


def render_page(template: str, ctx: dict) -> str:
    out = template
    for key, val in ctx.items():
        out = out.replace("{{" + key + "}}", str(val))
    # drop viewer section lines for private repos
    if ctx.get("htmlpreview_url"):
        out = re.sub(r"^<!-- if:public -->\n|^<!-- endif -->\n", "", out, flags=re.M)
    else:
        out = re.sub(r"<!-- if:public -->\n.*?<!-- endif -->\n", "", out,
                     flags=re.S)
    return out


def update_index(wiki_dir: Path, entries: list) -> None:
    index = wiki_dir / INDEX_PAGE
    rows = ["| Title | Slides | Updated | View |",
            "|-------|--------|---------|------|"]
    for e in sorted(entries, key=lambda x: x["updated"], reverse=True):
        view = f"[open]({e['view_url']})" if e.get("view_url") else \
               f"[download]({e['raw_url']})"
        rows.append(
            f"| [{e['title']}]({e['page']}) | {e['slide_count'] or '—'} "
            f"| {e['updated']} | {view} |")
    block = "\n".join([MARK_BEGIN, *rows, MARK_END])

    if index.exists():
        text = index.read_text(encoding="utf-8")
        if MARK_BEGIN in text and MARK_END in text:
            pre, rest = text.split(MARK_BEGIN, 1)
            _, post = rest.split(MARK_END, 1)
            text = pre + block + post
        else:
            text = text.rstrip() + "\n\n" + block + "\n"
    else:
        text = ("# Presentations\n\n"
                "HTML presentations published to this wiki.\n\n"
                + block + "\n")
    index.write_text(text, encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--wiki-dir", required=True, help="cloned wiki working tree")
    ap.add_argument("--repo", required=True, help="owner/name of the code repo")
    ap.add_argument("--html", required=True,
                    help="path of the HTML file, relative to wiki dir "
                         "(e.g. presentations/my-deck.html)")
    ap.add_argument("--title", required=True)
    ap.add_argument("--description", default="")
    ap.add_argument("--page-name", default="",
                    help="wiki page name; default: Presentation-<slug(title)>")
    ap.add_argument("--framework", default="unknown")
    ap.add_argument("--slide-count", type=int, default=0)
    ap.add_argument("--private", action="store_true",
                    help="omit viewer links (they require a public repo)")
    args = ap.parse_args()

    wiki_dir = Path(args.wiki_dir)
    html_rel = args.html.replace("\\", "/")
    if not (wiki_dir / html_rel).exists():
        print(f"error: {html_rel} not found in {wiki_dir}", file=sys.stderr)
        return 1

    page_name = args.page_name or f"Presentation-{slugify(args.title)}"
    page_name = slugify(page_name) if " " in page_name else page_name
    links = viewer_links(args.repo, html_rel, args.private)
    today = datetime.date.today().isoformat()
    size = (wiki_dir / html_rel).stat().st_size

    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    ctx = {
        "title": args.title,
        "description": args.description or "_No description provided._",
        "framework": args.framework,
        "slide_count": args.slide_count or "—",
        "size_human": f"{size / 1024:.0f} KB" if size < 1024 * 1024
                      else f"{size / 1024 / 1024:.1f} MB",
        "updated": today,
        "raw_url": links["raw"],
        "htmlpreview_url": links.get("htmlpreview", ""),
        "githack_url": links.get("githack", ""),
        "html_rel": html_rel,
        "repo": args.repo,
    }
    (wiki_dir / f"{page_name}.md").write_text(render_page(template, ctx),
                                              encoding="utf-8")

    entries = [e for e in load_meta(wiki_dir) if e.get("page") != page_name]
    entries.append({
        "page": page_name,
        "title": args.title,
        "slide_count": args.slide_count,
        "updated": today,
        "view_url": links.get("htmlpreview", ""),
        "raw_url": links["raw"],
        "file": html_rel,
    })
    save_meta(wiki_dir, entries)
    update_index(wiki_dir, entries)

    print(json.dumps({
        "page": page_name,
        "page_url": f"https://github.com/{args.repo}/wiki/{quote(page_name)}",
        "view_url": links.get("htmlpreview", ""),
        "raw_url": links["raw"],
    }, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
