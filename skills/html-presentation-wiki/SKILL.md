---
name: html-presentation-wiki
description: >-
  Publish HTML presentation files (reveal.js, impress.js, Marp, deck.js,
  Shower, or any single-file HTML slide deck) to a wiki — Confluence
  (Cloud/Server/DC) or GitHub Wiki. Use this skill whenever the user asks to
  upload, publish, share, or attach an HTML presentation (slides, slideshow,
  deck, 프리젠테이션, 발표자료) to Confluence or a wiki, including batches of
  multiple files. Handles page creation/update, attachment upload, viewer
  links, iframe embedding, and an auto-maintained index.
license: MIT
---

# HTML Presentation → Wiki Publisher

Publish self-contained HTML presentations to **Confluence** (primary target)
or **GitHub Wiki**, creating pages that make each deck easy to find and open.

## Step 0 — Pick the target

- User says Confluence / an Atlassian URL is involved / `CONFLUENCE_BASE_URL`
  is set → **Confluence workflow** below.
- User says GitHub Wiki / the deck belongs to a GitHub repo's wiki →
  **GitHub Wiki workflow** (further down).
- Ambiguous → ask which wiki they mean.

## Step 1 — Inspect (both targets, always first)

```bash
python3 scripts/inspect_presentation.py path/to/deck.html
```

Prints JSON: detected framework (reveal.js / impress.js / Marp / deck.js /
Shower / generic), title, slide count, size, external CDN refs, and
`local_refs` — relative file references that **break** after a single-file
upload. If `local_refs` is non-empty, tell the user exactly which references
break and get the deck self-contained before publishing (`--force`
overrides). External `https://` CDN refs are fine.

---

## Confluence workflow

### Key facts (set expectations with the user)

- Confluence serves HTML attachments with `Content-Disposition: attachment`
  → **downloads, never renders inline**. This is an Atlassian security
  decision, not a bug to work around.
- Confluence **Cloud has no HTML macro** (removed for security). Server/DC
  has one but it is disabled by default.
- Therefore the publishing pattern is: attach the HTML file + generate a
  page with a download link and metadata. If the deck is *also* hosted
  somewhere that serves `text/html` (GitHub Pages, S3, internal static
  host), pass `--embed-url` to add an inline iframe view on the page.

### Credentials

Required environment variables (ask the user to set them; never echo values):

```bash
export CONFLUENCE_BASE_URL="https://yoursite.atlassian.net/wiki"  # Cloud: keep /wiki
export CONFLUENCE_EMAIL="user@example.com"      # Cloud auth pair
export CONFLUENCE_API_TOKEN="..."               # id.atlassian.com → API tokens
# — or, for Server/Data Center —
export CONFLUENCE_PAT="..."                     # personal access token (Bearer)
```

### Publish (single file or batch)

```bash
# preview what will happen (no API calls)
python3 scripts/publish_to_confluence.py deck1.html deck2.html \
  --space DOCS --dry-run

# publish
python3 scripts/publish_to_confluence.py deck1.html deck2.html --space DOCS
```

Per file, the script creates or updates (same title = update, version bump)
a page under an auto-created **"HTML Presentations"** index page — the index
uses a `children` macro so it maintains itself — and uploads the HTML as the
page's attachment, replacing prior versions.

| Flag | Purpose |
|------|---------|
| `--space KEY` | Target space (required) |
| `--title` | Page title, single file only (default: HTML `<title>`) |
| `--description` | Intro sentence on the page |
| `--embed-url URL` | Externally hosted copy → iframe embed section |
| `--parent-title` / `--parent-id` | Custom parent instead of the default index |
| `--dry-run` | Print the plan, call nothing |
| `--force` | Publish despite local file references |

The script prints JSON with `page_url` per file — relay every URL to the
user. Auth/permission/404 errors come with actionable hints; deeper
troubleshooting: [references/confluence.md](references/confluence.md).

### Offer the inline-view upgrade

After a Confluence publish, if the repo is public on GitHub, offer to also
host the deck on GitHub Pages and re-publish with `--embed-url` so the
presentation plays inside the Confluence page. See
[references/hosting-options.md](references/hosting-options.md).

---

## GitHub Wiki workflow

GitHub Wiki is a git repo (`<owner>/<repo>.wiki.git`); raw files are served
as `text/plain`, so pages get htmlpreview/githack viewer links instead
(public repos only).

```bash
bash scripts/publish_to_wiki.sh --file deck.html --title "Q3 Review" \
  [--repo owner/name] [--private] [--page-name Name] [--force]
```

Clones the wiki, publishes to `presentations/`, generates the page +
`Presentations` index, pushes with retries. If cloning fails with
"repository not found", the wiki was never initialized — the user must
create the first page in the web UI once, then re-run. Details and failure
table: [references/github-wiki.md](references/github-wiki.md).

---

## Notes and edge cases

- **Multiple frameworks**: inspection auto-detects the framework; no flags
  needed. Unknown frameworks publish fine as `generic-html`.
- **Updating**: re-publish with the same title — both targets treat title as
  identity and replace the file/page in place.
- **Size**: warn over 10 MB; Confluence sites and GitHub enforce their own
  hard limits. Suggest compressing embedded images.
- **Don't guess identifiers**: space keys, base URLs, and repo owners must
  come from the user or the environment — ask if missing.
- **Building a deck from scratch** is out of scope: create a self-contained
  reveal.js HTML file first (CDN assets only), then publish it.
