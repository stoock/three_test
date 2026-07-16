# GitHub Wiki mechanics & troubleshooting

## The wiki is a git repository

- URL: `https://github.com/<owner>/<repo>.wiki.git` (SSH: `git@github.com:<owner>/<repo>.wiki.git`)
- Default branch is usually `master` (not `main`) — always push to whatever
  `HEAD` resolves to after cloning; never hard-code.
- Pages are files at the repo root: `Page-Name.md` → `github.com/<owner>/<repo>/wiki/Page-Name`.
- Subdirectories are allowed for **assets** but pages in subdirectories are
  not listed in the sidebar; keep `.md` pages at the root.
- `Home.md` is the wiki landing page; `_Sidebar.md` and `_Footer.md`
  customize navigation.

## How non-Markdown files behave

- Any file type can be committed, but only Markdown/AsciiDoc/etc. render as
  pages.
- Raw files are served at
  `https://raw.githubusercontent.com/wiki/<owner>/<repo>/<path>`
  with `Content-Type: text/plain` → browsers show HTML source, not the page.
  This is why viewer proxies are needed (see hosting-options.md).
- File size limits follow normal GitHub rules: hard reject > 100 MB,
  warning > 50 MB. Keep presentations well under 10 MB for fast viewer loads.

## Common failures

| Symptom | Cause | Fix |
|---------|-------|-----|
| `clone` → "repository not found" | Wiki never initialized | Create the first page in the web UI (`github.com/<owner>/<repo>/wiki` → "Create the first page"), then retry |
| `clone` → "repository not found" (wiki exists) | Wiki disabled, private repo without access, or bad credentials | Enable wiki in Settings → Features; verify token/SSH access to the repo |
| `push` → 403 | Token lacks write access; or repo restricts wiki editing to collaborators | Use credentials with `repo` write scope; check Settings → Features → "Restrict editing to collaborators only" |
| `push` → non-fast-forward | Someone edited the wiki since clone | Re-clone (script re-run is enough — clone is fresh each run) |
| Viewer link shows blank/broken page | Presentation depends on local files that weren't uploaded | Re-inspect: `inspect_presentation.py` lists `local_refs`; inline them |
| Viewer link 404 on private repo | htmlpreview/githack can only read public raw URLs | Use `--private` and GitHub Pages hosting instead |

## Authentication notes

- HTTPS clones use the same credential helper as normal repo access
  (`gh auth`, stored PAT, or the environment's credential injection).
- A fine-grained PAT needs **Contents: Read and write** on the repository —
  wiki write access rides on repo write permission.
- GitHub Enterprise Server: same mechanics; pass the full wiki git URL via
  `--wiki-url` and adjust raw URLs manually (raw host differs).
