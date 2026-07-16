---
name: html-presentation-wiki
description: >-
  Publish HTML presentation files (reveal.js, impress.js, Marp, or any
  single-file HTML slide deck) to a GitHub Wiki. Use this skill whenever the
  user asks to upload, publish, share, or attach an HTML presentation (slides,
  slideshow, deck, 프리젠테이션, 발표자료) to a wiki, or asks to maintain a wiki
  index of presentations. Handles wiki git cloning, viewer-link generation
  (htmlpreview / raw.githack), per-presentation wiki pages, and an auto-updated
  index page.
license: MIT
---

# HTML Presentation → GitHub Wiki Publisher

Publish a self-contained HTML presentation to a repository's GitHub Wiki and
create/refresh wiki pages that make it viewable in one click.

## How it works (read this first)

A GitHub Wiki is itself a git repository at
`https://github.com/<owner>/<repo>.wiki.git`. Any file can be pushed to it,
but GitHub serves non-Markdown files as `text/plain`, so a pushed `.html`
file will not render on its own. This skill solves that by:

1. Pushing the HTML file into the wiki repo under `presentations/`.
2. Creating a wiki page per presentation with **viewer links**
   (htmlpreview.github.io and raw.githack.com re-serve the raw file with the
   correct `Content-Type`) plus a raw download link and metadata.
3. Maintaining a `Presentations` index page listing every published deck.

Viewer links only work for **public** repositories. For private repos, see
[references/hosting-options.md](references/hosting-options.md) (GitHub Pages
is the recommended alternative there).

## Workflow

### Step 1 — Inspect the presentation

Always inspect before publishing:

```bash
python3 scripts/inspect_presentation.py path/to/deck.html
```

This prints JSON: detected framework, title, slide count, file size, external
CDN resources, and — critically — **local file references** (`./img/x.png`,
`css/style.css`, …). A wiki upload is a single file, so local references will
break.

- If `local_refs` is non-empty: tell the user which references will break and
  offer to inline them or ask for a self-contained export. Do not publish
  broken decks silently (the script exits non-zero; `--force` overrides).
- External `https://` CDN resources are fine — the deck is viewed online.

### Step 2 — Confirm the target repository

The publish script auto-detects the repo from `git remote get-url origin`.
If the current directory is not the intended repo (or has no remote), pass
`--repo <owner>/<name>` explicitly. Never guess an owner/name — ask the user
if it cannot be derived.

### Step 3 — Publish

```bash
bash scripts/publish_to_wiki.sh \
  --file path/to/deck.html \
  --title "Q3 Architecture Review" \
  --description "One-line summary shown on the index page"
```

The script clones the wiki, runs the inspection, copies the file to
`presentations/<slug>.html`, generates the wiki page and index via
`scripts/generate_wiki_page.py`, commits, and pushes with retries
(2s/4s/8s/16s backoff).

Useful flags:

| Flag | Purpose |
|------|---------|
| `--repo owner/name` | Target repo when it can't be derived from `origin` |
| `--page-name "My-Page"` | Override the wiki page name (default: slug of title) |
| `--wiki-url <git-url>` | Override the wiki git URL entirely (testing, GHES) |
| `--private` | Skip viewer links, emit download-only page for private repos |
| `--force` | Publish even if local file references were detected |

### Step 4 — Handle the one common failure

If cloning the wiki fails with "repository not found", the wiki has never
been initialized. GitHub only creates the underlying wiki git repo after the
**first page is created in the web UI**. Tell the user to open
`https://github.com/<owner>/<repo>/wiki`, click **Create the first page**,
save it (content can be anything), then re-run the publish script. Other
failures: see [references/github-wiki.md](references/github-wiki.md).

### Step 5 — Report results

After a successful push, the script prints the final URLs. Relay all of them
to the user:

- Wiki page: `https://github.com/<owner>/<repo>/wiki/<Page-Name>`
- Live viewer link (public repos)
- Raw download link

## Notes and edge cases

- **File size**: warn above 10 MB (slow viewer loading); GitHub rejects files
  over 100 MB. Suggest compressing embedded images if oversized.
- **Updating an existing deck**: re-running publish with the same title
  overwrites `presentations/<slug>.html` and refreshes the page — this is the
  supported update path.
- **Wiki page naming**: GitHub wiki page names come from the `.md` filename;
  spaces become hyphens. The scripts already slugify safely.
- **Don't hand-edit the index between markers**: `Presentations.md` content
  between `<!-- presentations:begin -->` and `<!-- presentations:end -->` is
  regenerated on every publish.
- **Creating a deck from scratch**: this skill publishes existing HTML. If
  the user first needs a presentation built, build a self-contained
  reveal.js HTML file (CDN assets, no local files), then publish it.
- **Non-GitHub wikis** (Confluence, MediaWiki, DokuWiki): out of scope for
  the scripts; see [references/hosting-options.md](references/hosting-options.md)
  for guidance to give the user.
