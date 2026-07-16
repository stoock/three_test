# Making a wiki-hosted HTML presentation viewable

Raw wiki files are served as `text/plain`, so a plain link never renders.
Pick a strategy based on repo visibility and audience.

## Decision guide

| Situation | Recommended strategy |
|-----------|---------------------|
| Public repo, casual sharing | **htmlpreview / githack viewer links** (default of this skill) |
| Public repo, heavy traffic or big decks | **GitHub Pages** + wiki page links to it |
| Private repo | **GitHub Pages** (private Pages requires GitHub Enterprise Cloud) or download-only wiki page (`--private`) |
| Company wiki (Confluence, MediaWiki, …) | Upload as attachment; see below |

## 1. Viewer proxies (default)

- `https://htmlpreview.github.io/?<raw-url>` — rewrites the raw file so the
  browser renders it. Works for public repos only. JS-heavy decks work but
  very large files can be slow.
- `https://rawcdn.githack.com/wiki/<owner>/<repo>/<path>` — CDN-cached proxy
  serving correct `Content-Type`. Note: the `rawcdn` variant caches
  aggressively; after an update the URL may serve stale content for a while.
  `https://raw.githack.com/...` (no `cdn`) is the development variant that
  updates immediately but is throttled.

## 2. GitHub Pages (most reliable)

When viewer proxies are not acceptable (private repo, stale caching, big
audience), host the HTML in the main repo instead of/in addition to the wiki:

1. Commit the deck to the main repo, e.g. `docs/presentations/<slug>.html`.
2. Enable Pages: Settings → Pages → Deploy from branch → `main` + `/docs`.
3. Deck URL: `https://<owner>.github.io/<repo>/presentations/<slug>.html`.
4. Still create the wiki page (this skill's `generate_wiki_page.py` can be
   run with any URL substituted afterwards, or just edit the generated page
   to point its "Open in browser" link at the Pages URL).

## 3. Confluence

Use the bundled `scripts/publish_to_confluence.py` — see
[confluence.md](confluence.md) for mechanics. Best inline experience:
host the deck on GitHub Pages (section 2 above) and pass that URL as
`--embed-url` so the Confluence page embeds it via the iframe macro.

## 4. Other wikis (no bundled script)

- **MediaWiki**: raw HTML is disabled by default; upload as a file
  (`Special:Upload`, may need `$wgFileExtensions[] = 'html';`) and link it,
  or host externally and link.
- **DokuWiki**: media upload + link; inline HTML requires `htmlok` config.

In all these cases the safest universal pattern is: host the HTML somewhere
that serves `text/html` (GitHub Pages, S3, internal static host) and put a
link + summary on the wiki page.
