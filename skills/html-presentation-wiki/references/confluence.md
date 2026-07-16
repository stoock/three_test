# Confluence publishing — mechanics & troubleshooting

## Cloud vs Server/Data Center

| | Cloud | Server / DC |
|---|---|---|
| Base URL | `https://<site>.atlassian.net/wiki` (the `/wiki` suffix is part of the API base) | `https://confluence.example.com` (context path varies) |
| Auth | Basic: email + API token ([create one](https://id.atlassian.com/manage-profile/security/api-tokens)) | Bearer: personal access token (Profile → Personal Access Tokens), or Basic with password on old versions |
| HTML macro | **Removed** (security) — no native inline HTML | Exists but **disabled by default**; admin enables in System → Configure Code Macro/HTML |
| HTML attachments | Force-download (`Content-Disposition: attachment`) | Same since 5.1 |
| Iframe macro | Available; domain allowlist managed by admin | Not built-in on older versions |

## REST endpoints the script uses (v1 API, works on both)

- Find page: `GET /rest/api/content?spaceKey=KEY&title=TITLE&expand=version`
- Create page: `POST /rest/api/content` (`ancestors` sets the parent)
- Update page: `PUT /rest/api/content/{id}` — must send `version.number + 1`
- List attachment by name: `GET /rest/api/content/{id}/child/attachment?filename=NAME`
- New attachment: `POST /rest/api/content/{id}/child/attachment`
  (multipart, header `X-Atlassian-Token: nocheck` is mandatory)
- Replace attachment: `POST /rest/api/content/{id}/child/attachment/{attId}/data`

## Storage-format snippets used on generated pages

Attachment link:

```xml
<ac:link><ri:attachment ri:filename="deck.html"/>
  <ac:plain-text-link-body><![CDATA[deck.html]]></ac:plain-text-link-body>
</ac:link>
```

Self-maintaining index (children macro):

```xml
<ac:structured-macro ac:name="children">
  <ac:parameter ac:name="all">true</ac:parameter>
</ac:structured-macro>
```

Iframe embed of an externally hosted deck:

```xml
<ac:structured-macro ac:name="iframe">
  <ac:parameter ac:name="src"><ri:url ri:value="https://host/deck.html"/></ac:parameter>
  <ac:parameter ac:name="width">100%</ac:parameter>
  <ac:parameter ac:name="height">620</ac:parameter>
</ac:structured-macro>
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| 401 | Bad email/token pair, or PAT expired | Regenerate token; Cloud tokens pair with the **email**, not username |
| 403 on everything | CAPTCHA lock after failed logins, or no space permission | Log in once via browser to clear CAPTCHA; check space permissions |
| 403 only on attachment upload | Missing `X-Atlassian-Token: nocheck` header (XSRF) | The script sends it; if calling manually, add it |
| 404 on `/rest/api/content` | Wrong base URL — Cloud calls fail without `/wiki` | Set `CONFLUENCE_BASE_URL` ending in `/wiki` for Cloud |
| 409 / version conflict on update | Page edited between read and write | Re-run; the script re-reads the current version each run |
| "attachment too large" (413) | Site attachment size limit (default 100 MB Cloud, admin-set on DC) | Compress embedded images; split the deck |
| Iframe shows nothing | Cloud iframe macro domain not allowlisted, or target sends `X-Frame-Options: DENY` | Admin allowlists the domain; GitHub Pages allows framing, raw.githubusercontent.com does not |
| Uploaded HTML opens as download | Expected behavior — Confluence never renders attached HTML inline | Use `--embed-url` with an externally hosted copy for inline viewing |

## Viewing strategy recap

1. **Download-and-open** (default): always works, zero setup.
2. **Iframe embed** (`--embed-url`): host the deck on GitHub Pages/S3/an
   internal static host, embed it inline. Best user experience.
3. **Marketplace HTML apps** (Cloud): third-party macros can render attached
   HTML, but require admin installation — mention, don't assume.
