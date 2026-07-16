#!/usr/bin/env bash
# Publish an HTML presentation to a GitHub Wiki.
#
# Clones <owner>/<repo>.wiki.git, copies the HTML into presentations/,
# generates the per-presentation wiki page + Presentations index, commits,
# and pushes with exponential-backoff retries.
#
# Usage:
#   publish_to_wiki.sh --file deck.html [--title "My Deck"]
#                      [--repo owner/name] [--description "..."]
#                      [--page-name Page-Name] [--wiki-url <git-url>]
#                      [--private] [--force] [--keep-temp]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

FILE="" TITLE="" REPO="" DESCRIPTION="" PAGE_NAME="" WIKI_URL=""
PRIVATE=0 FORCE=0 KEEP_TEMP=0

die() { echo "error: $*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --file)        FILE="$2"; shift 2 ;;
    --title)       TITLE="$2"; shift 2 ;;
    --repo)        REPO="$2"; shift 2 ;;
    --description) DESCRIPTION="$2"; shift 2 ;;
    --page-name)   PAGE_NAME="$2"; shift 2 ;;
    --wiki-url)    WIKI_URL="$2"; shift 2 ;;
    --private)     PRIVATE=1; shift ;;
    --force)       FORCE=1; shift ;;
    --keep-temp)   KEEP_TEMP=1; shift ;;
    -h|--help)     grep '^#' "$0" | cut -c3-; exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
done

[[ -n "$FILE" ]] || die "--file is required"
[[ -f "$FILE" ]] || die "file not found: $FILE"

# ---- derive repo from origin when not given -------------------------------
if [[ -z "$REPO" && -z "$WIKI_URL" ]]; then
  origin="$(git remote get-url origin 2>/dev/null || true)"
  [[ -n "$origin" ]] || die "cannot derive repo: no git origin here. Pass --repo owner/name."
  REPO="$(echo "$origin" | sed -E 's#^(git@[^:]+:|https?://[^/]+/)##; s#\.git$##')"
  [[ "$REPO" == */* ]] || die "could not parse owner/name from origin '$origin'. Pass --repo."
fi
[[ -n "$WIKI_URL" ]] || WIKI_URL="https://github.com/${REPO}.wiki.git"
[[ -n "$REPO" ]] || REPO="local/test"   # placeholder for --wiki-url test runs

# ---- inspect ---------------------------------------------------------------
echo ">> Inspecting $FILE"
INSPECT_ARGS=()
[[ $FORCE -eq 1 ]] && INSPECT_ARGS+=(--force)
REPORT="$(python3 "$SCRIPT_DIR/inspect_presentation.py" "$FILE" "${INSPECT_ARGS[@]}")" || {
  echo "$REPORT"
  die "presentation has local file references and would break after upload. Fix them or re-run with --force."
}
echo "$REPORT"

meta() { echo "$REPORT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('$1',''))"; }
FRAMEWORK="$(meta framework)"
SLIDES="$(meta slide_count)"
[[ -n "$TITLE" ]] || TITLE="$(meta title)"

# ---- clone wiki -------------------------------------------------------------
TMP="$(mktemp -d "${TMPDIR:-/tmp}/wiki-publish.XXXXXX")"
cleanup() { [[ $KEEP_TEMP -eq 1 ]] || rm -rf "$TMP"; }
trap cleanup EXIT

echo ">> Cloning $WIKI_URL"
if ! git clone --depth 1 "$WIKI_URL" "$TMP/wiki" 2>"$TMP/clone.err"; then
  cat "$TMP/clone.err" >&2
  cat >&2 <<EOF

The wiki repository could not be cloned. Most common cause: the wiki has
never been initialized. GitHub creates ${REPO}.wiki.git only after the first
page is created in the web UI:

  1. Open https://github.com/${REPO}/wiki
  2. Click "Create the first page", save it (any content)
  3. Re-run this script

Also check: the wiki is enabled in repo Settings, and your git credentials
have write access to ${REPO}.
EOF
  exit 1
fi

# ---- copy file + generate pages ---------------------------------------------
SLUG="$(python3 -c "
import re,sys
s=re.sub(r'[^\w\s-]','',sys.argv[1]).strip()
print(re.sub(r'[\s_]+','-',s).strip('-') or 'presentation')
" "$TITLE")"
mkdir -p "$TMP/wiki/presentations"
cp "$FILE" "$TMP/wiki/presentations/${SLUG}.html"

GEN_ARGS=(--wiki-dir "$TMP/wiki" --repo "$REPO"
          --html "presentations/${SLUG}.html"
          --title "$TITLE" --description "$DESCRIPTION"
          --framework "$FRAMEWORK" --slide-count "${SLIDES:-0}")
[[ -n "$PAGE_NAME" ]] && GEN_ARGS+=(--page-name "$PAGE_NAME")
[[ $PRIVATE -eq 1 ]] && GEN_ARGS+=(--private)

echo ">> Generating wiki pages"
RESULT="$(python3 "$SCRIPT_DIR/generate_wiki_page.py" "${GEN_ARGS[@]}")"

# ---- commit + push with retries ---------------------------------------------
cd "$TMP/wiki"
git add -A
if git diff --cached --quiet; then
  echo ">> Nothing changed — wiki already up to date."
else
  git -c user.name="${GIT_AUTHOR_NAME:-$(git config user.name || echo wiki-publisher)}" \
      -c user.email="${GIT_AUTHOR_EMAIL:-$(git config user.email || echo wiki-publisher@localhost)}" \
      commit -m "Publish presentation: ${TITLE}" --quiet
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  delay=2
  for attempt in 1 2 3 4 5; do
    if git push origin "$BRANCH" 2>"$TMP/push.err"; then
      echo ">> Pushed to $WIKI_URL ($BRANCH)"
      break
    fi
    if [[ $attempt -eq 5 ]]; then
      cat "$TMP/push.err" >&2
      die "push failed after 5 attempts"
    fi
    echo ">> Push failed (attempt $attempt), retrying in ${delay}s..." >&2
    sleep "$delay"; delay=$((delay * 2))
  done
fi

echo
echo "== Published =="
echo "$RESULT"
