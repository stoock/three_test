#!/usr/bin/env python3
"""Publish one or more HTML presentations to Confluence.

For each HTML file this script:
  1. inspects it (framework, title, slide count, broken local references)
  2. creates or updates a Confluence page (one page per presentation)
  3. uploads the HTML file as a page attachment (replacing prior versions)
  4. renders a page body with a download link, metadata table, and an
     optional iframe embed of an externally hosted copy

Pages are nested under an index page (default title "HTML Presentations",
auto-created with a children macro, so the index maintains itself).

Authentication (environment variables):
  CONFLUENCE_BASE_URL   e.g. https://yoursite.atlassian.net/wiki  (Cloud)
                        or   https://confluence.example.com       (Server/DC)
  CONFLUENCE_EMAIL + CONFLUENCE_API_TOKEN   -> Basic auth (Cloud)
  CONFLUENCE_PAT                            -> Bearer token (Server/DC)

Usage:
  publish_to_confluence.py deck1.html deck2.html --space DOCS
  publish_to_confluence.py deck.html --space DOCS --title "Q3 Review" \
      --description "..." --embed-url https://me.github.io/deck.html
"""

import argparse
import base64
import datetime
import json
import mimetypes
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_INDEX_TITLE = "HTML Presentations"


# ---------------------------------------------------------------- utilities

def xml_escape(text: str) -> str:
    return (str(text).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def slugify(text: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", text, flags=re.UNICODE).strip()
    slug = re.sub(r"[\s_]+", "-", slug)
    return slug.strip("-") or "presentation"


def inspect(file: Path, force: bool) -> dict:
    cmd = [sys.executable, str(SCRIPT_DIR / "inspect_presentation.py"), str(file)]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode not in (0, 2):
        raise SystemExit(f"inspection failed for {file}: {proc.stderr.strip()}")
    report = json.loads(proc.stdout)
    if proc.returncode == 2 and not force:
        refs = ", ".join(report["local_refs"][:5])
        raise SystemExit(
            f"{file}: local file references would break after upload ({refs}). "
            "Make the file self-contained or re-run with --force.")
    return report


# ---------------------------------------------------------------- API client

class Confluence:
    def __init__(self, base_url: str):
        self.base = base_url.rstrip("/")
        email = os.environ.get("CONFLUENCE_EMAIL") or os.environ.get("CONFLUENCE_USER")
        token = os.environ.get("CONFLUENCE_API_TOKEN")
        pat = os.environ.get("CONFLUENCE_PAT")
        if email and token:
            cred = base64.b64encode(f"{email}:{token}".encode()).decode()
            self.auth_header = f"Basic {cred}"
        elif pat:
            self.auth_header = f"Bearer {pat}"
        else:
            raise SystemExit(
                "no Confluence credentials: set CONFLUENCE_EMAIL + "
                "CONFLUENCE_API_TOKEN (Cloud) or CONFLUENCE_PAT (Server/DC).")

    def _request(self, method: str, path: str, body: bytes = None,
                 headers: dict = None):
        req = urllib.request.Request(self.base + path, data=body, method=method)
        req.add_header("Authorization", self.auth_header)
        req.add_header("Accept", "application/json")
        for k, v in (headers or {}).items():
            req.add_header(k, v)
        try:
            with urllib.request.urlopen(req) as resp:
                data = resp.read()
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:2000]
            raise SystemExit(
                f"Confluence API error {e.code} on {method} {path}\n{detail}\n"
                + hint_for(e.code))
        return json.loads(data) if data else {}

    def json(self, method: str, path: str, payload: dict = None):
        body = json.dumps(payload).encode() if payload is not None else None
        return self._request(method, path, body,
                             {"Content-Type": "application/json"})

    def get_page(self, space: str, title: str):
        q = urllib.parse.urlencode({"spaceKey": space, "title": title,
                                    "expand": "version"})
        results = self.json("GET", f"/rest/api/content?{q}").get("results", [])
        return results[0] if results else None

    def create_page(self, space: str, title: str, storage_body: str,
                    parent_id: str = None) -> dict:
        payload = {
            "type": "page",
            "title": title,
            "space": {"key": space},
            "body": {"storage": {"value": storage_body,
                                 "representation": "storage"}},
        }
        if parent_id:
            payload["ancestors"] = [{"id": str(parent_id)}]
        return self.json("POST", "/rest/api/content", payload)

    def update_page(self, page: dict, storage_body: str) -> dict:
        payload = {
            "type": "page",
            "title": page["title"],
            "version": {"number": page["version"]["number"] + 1,
                        "message": "Updated by html-presentation-wiki skill"},
            "body": {"storage": {"value": storage_body,
                                 "representation": "storage"}},
        }
        return self.json("PUT", f"/rest/api/content/{page['id']}", payload)

    def upload_attachment(self, page_id: str, file: Path, filename: str) -> dict:
        q = urllib.parse.urlencode({"filename": filename})
        existing = self.json(
            "GET", f"/rest/api/content/{page_id}/child/attachment?{q}"
        ).get("results", [])
        path = (f"/rest/api/content/{page_id}/child/attachment/"
                f"{existing[0]['id']}/data" if existing
                else f"/rest/api/content/{page_id}/child/attachment")
        body, ctype = multipart(file, filename)
        return self._request("POST", path, body, {
            "Content-Type": ctype,
            "X-Atlassian-Token": "nocheck",
        })


def multipart(file: Path, filename: str):
    boundary = uuid.uuid4().hex
    mime = mimetypes.guess_type(filename)[0] or "text/html"
    head = (f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; '
            f'filename="{filename}"\r\n'
            f"Content-Type: {mime}\r\n\r\n").encode()
    comment = (f"--{boundary}\r\n"
               'Content-Disposition: form-data; name="comment"\r\n\r\n'
               "Uploaded by html-presentation-wiki skill\r\n").encode()
    tail = f"\r\n--{boundary}--\r\n".encode()
    body = head + file.read_bytes() + b"\r\n" + comment + tail
    return body, f"multipart/form-data; boundary={boundary}"


def hint_for(code: int) -> str:
    return {
        401: "hint: credentials rejected — regenerate the API token at "
             "https://id.atlassian.com/manage-profile/security/api-tokens",
        403: "hint: no permission on this space/page, or CAPTCHA triggered "
             "by failed logins — log in via browser once, then retry",
        404: "hint: check CONFLUENCE_BASE_URL (Cloud needs the /wiki suffix) "
             "and the space key",
        413: "hint: attachment exceeds the site's attachment size limit",
    }.get(code, "")


# ---------------------------------------------------------------- page bodies

def index_body() -> str:
    return (
        "<p>HTML presentations published by the "
        "<code>html-presentation-wiki</code> skill. "
        "Each child page carries one presentation as an attachment.</p>"
        '<ac:structured-macro ac:name="children">'
        '<ac:parameter ac:name="all">true</ac:parameter>'
        "</ac:structured-macro>"
    )


def deck_body(report: dict, filename: str, description: str,
              embed_url: str) -> str:
    size = report["size_bytes"]
    size_h = (f"{size / 1024:.0f} KB" if size < 1024 * 1024
              else f"{size / 1024 / 1024:.1f} MB")
    parts = []
    if description:
        parts.append(f"<p><em>{xml_escape(description)}</em></p>")
    parts.append(
        '<ac:structured-macro ac:name="info"><ac:rich-text-body>'
        "<p>This presentation is attached as a single HTML file. "
        "Confluence serves HTML attachments as downloads for security — "
        "download it and open it in any browser to present.</p>"
        "</ac:rich-text-body></ac:structured-macro>")
    if embed_url:
        parts.append("<h2>View inline</h2>")
        parts.append(
            '<ac:structured-macro ac:name="iframe">'
            f'<ac:parameter ac:name="src"><ri:url ri:value="{xml_escape(embed_url)}"/></ac:parameter>'
            '<ac:parameter ac:name="width">100%</ac:parameter>'
            '<ac:parameter ac:name="height">620</ac:parameter>'
            "</ac:structured-macro>")
        parts.append(
            f'<p><a href="{xml_escape(embed_url)}">Open full screen ↗</a></p>')
    parts.append("<h2>Download</h2>")
    parts.append(
        "<p><ac:link>"
        f'<ri:attachment ri:filename="{xml_escape(filename)}"/>'
        f"<ac:plain-text-link-body><![CDATA[{filename}]]></ac:plain-text-link-body>"
        "</ac:link> — download, then open in a browser.</p>")
    rows = [
        ("Framework", report["framework"]),
        ("Slides", report["slide_count"] or "—"),
        ("File size", size_h),
        ("Last updated", datetime.date.today().isoformat()),
    ]
    cells = "".join(
        f"<tr><th>{xml_escape(k)}</th><td>{xml_escape(v)}</td></tr>"
        for k, v in rows)
    parts.append(f"<h2>Details</h2><table><tbody>{cells}</tbody></table>")
    return "".join(parts)


# ------------------------------------------------------------------- publish

def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__.splitlines()[0],
        formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__)
    ap.add_argument("files", nargs="+", help="HTML presentation file(s)")
    ap.add_argument("--space", required=True, help="Confluence space key")
    ap.add_argument("--base-url", default=os.environ.get("CONFLUENCE_BASE_URL", ""),
                    help="Confluence base URL (or env CONFLUENCE_BASE_URL)")
    ap.add_argument("--title", default="",
                    help="page title (single file only; default: HTML <title>)")
    ap.add_argument("--description", default="")
    ap.add_argument("--embed-url", default="",
                    help="externally hosted URL of the deck to embed via "
                         "iframe macro (single file only)")
    ap.add_argument("--parent-title", default=DEFAULT_INDEX_TITLE,
                    help=f'index/parent page title (default "{DEFAULT_INDEX_TITLE}")')
    ap.add_argument("--parent-id", default="",
                    help="explicit parent page id (skips index auto-create)")
    ap.add_argument("--force", action="store_true",
                    help="publish even if local file references were found")
    ap.add_argument("--dry-run", action="store_true",
                    help="inspect and print the plan without calling the API")
    args = ap.parse_args()

    if len(args.files) > 1 and (args.title or args.embed_url):
        ap.error("--title/--embed-url only make sense with a single file")
    if not args.base_url:
        ap.error("no base URL: pass --base-url or set CONFLUENCE_BASE_URL")

    files = [Path(f) for f in args.files]
    missing = [str(f) for f in files if not f.is_file()]
    if missing:
        raise SystemExit(f"file not found: {', '.join(missing)}")

    reports = {f: inspect(f, args.force) for f in files}

    if args.dry_run:
        plan = [{
            "file": str(f),
            "page_title": args.title or r["title"],
            "attachment": slugify(args.title or r["title"]) + ".html",
            "framework": r["framework"],
            "slides": r["slide_count"],
            "warnings": r["warnings"],
        } for f, r in reports.items()]
        json.dump({"space": args.space, "parent": args.parent_id or
                   args.parent_title, "plan": plan},
                  sys.stdout, indent=2, ensure_ascii=False)
        print()
        return 0

    api = Confluence(args.base_url)

    parent_id = args.parent_id
    if not parent_id:
        index = api.get_page(args.space, args.parent_title)
        if index is None:
            index = api.create_page(args.space, args.parent_title, index_body())
            print(f">> Created index page: {args.parent_title}", file=sys.stderr)
        parent_id = index["id"]

    published = []
    for f in files:
        report = reports[f]
        title = args.title or report["title"]
        filename = slugify(title) + ".html"

        page = api.get_page(args.space, title)
        body = deck_body(report, filename, args.description, args.embed_url)
        if page is None:
            page = api.create_page(args.space, title, body, parent_id)
            action = "created"
        else:
            api.update_page(page, body)
            action = "updated"
        api.upload_attachment(page["id"], f, filename)

        webui = (page.get("_links") or {}).get("webui", "")
        page_url = args.base_url.rstrip("/") + webui if webui else \
            f"{args.base_url.rstrip('/')}/pages/viewpage.action?pageId={page['id']}"
        published.append({
            "file": str(f), "action": action, "page_id": page["id"],
            "title": title, "attachment": filename, "page_url": page_url,
        })
        print(f">> {action}: {title} ({f})", file=sys.stderr)

    json.dump({"published": published}, sys.stdout, indent=2,
              ensure_ascii=False)
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
