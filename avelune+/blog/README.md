# Study Notes — static article site

Converts the generated study pages into a standalone, crawlable HTML site that
looks like the rest of Avelune+.

Pages are authored as strict Markdown by `generate_pages.py` and stored in
`public.pages` in the syllabus Supabase project. This script reads the
**published** rows, converts them to HTML, and writes a static site you can
deploy anywhere.

```
blog/
  generate_pages.py      generates the markdown into Supabase
  generate_static.py     turns that markdown into a static HTML site
  assets/article.css     stylesheet (mirrors the app's design tokens)
  sample/                a sample note for testing offline
  dist/                  build output — deploy this
```

## Draft vs. published

`status` now means exactly one thing: **the page exists as static HTML**. A page
starts life as `draft`; the moment its HTML is written to `dist/`, the script
flips it to `published`. The database and the built site can no longer disagree.

The build reads both `draft` and `published` rows, so every rebuilt site contains
the full catalogue, and pages that were already published are left untouched.

```powershell
python generate_static.py --clean         # full catalogue, publishes new pages
python generate_static.py --only-new      # only what is still 'draft'
python generate_static.py --no-publish    # build without touching statuses
```

## Quick start

```powershell
cd blog
pip install -r requirements.txt

# Build from the sample note, no database needed:
python generate_static.py --source local --clean --no-math

# Preview:
cd dist; python -m http.server 8080
# open http://localhost:8080
```

## Building from Supabase

The script reads `blog/.env` (same file `generate_pages.py` uses). Only rows with
`status = 'published'` are included:

```sql
update public.pages set status = 'published' where slug = 'some-slug';
```

```powershell
python generate_static.py                # all published pages
python generate_static.py --limit 25     # build a subset while testing
python generate_static.py --slug the-slug
```

Set the public origin so canonical URLs, `sitemap.xml` and the sitemap reference
in `robots.txt` are generated:

```powershell
$env:ARTICLE_SITE_URL = "https://notes.your-domain.com"
```

And where the "practise" call to action should point (defaults to the current
Netlify app URL):

```powershell
$env:ARTICLE_APP_URL = "https://avelune-plus.netlify.app"
```

The fetch happens at build time with the server-side key only. **No key or
secret is written into the generated HTML** — the output is entirely static and
safe to host publicly.

## Output

| Path | Contents |
| --- | --- |
| `dist/index.html` | index, grouped by topic, with live search |
| `dist/articles/<slug>/index.html` | one page per note |
| `dist/assets/article.<hash>.css` | content-fingerprinted stylesheet |
| `dist/assets/logo.png`, `favicon.svg` | copied from `../public` |
| `dist/sitemap.xml` | generated when `ARTICLE_SITE_URL` is set (ISO 8601 dates) |
| `dist/robots.txt` | allows crawling, links the sitemap |
| `dist/_headers` | Netlify security and cache headers |

Each article page includes a topic pill, the title, a table of contents built
from the `##`/`###` headings, the rendered Markdown, a call to action into the
app, and `Article` structured data for search engines. On screens 1200px and
wider the contents rail sticks to the left so long notes stay navigable while
the reading measure stays at 76 characters.

## Browsing and search

The index groups notes by **topic** (the level students navigate by), with the
course shown as the kicker on each card. A search box above the list filters
live, with no build step or backend:

- Matches title, topic, course, slug, and every module heading — so searching
  `fibrinolysis` finds the coagulation note even when the word is not in the
  excerpt.
- Multiple words are AND-ed, so `blood pressure regulation` only returns notes
  containing all three.
- Empty subject groups collapse, the live count updates, and Escape or an empty
  box restores everything. Pressing `/` anywhere focuses the search box.

## Asset caching

`public/_headers` (Vite copies it into `dist/_headers`) sets
`Cache-Control: public, max-age=31536000, immutable` on
`/study-notes/assets/*`, so the stylesheet is written under a SHA-256 content
hash and referenced by that name. Editing `assets/article.css` produces a new
URL and every visitor picks it up immediately, instead of being stuck on a
cached copy forever.

## Deploy on Netlify

The notes ship **inside your existing site** at `/study-notes`, so they inherit
`avelune-plus.netlify.app` and you don't manage a second Netlify project.
`npm run build:notes` regenerates them into `public/study-notes/`, Vite copies
that into `dist/`, and Netlify publishes it as ordinary static files. Because
Netlify checks the filesystem before applying rewrites, the SPA catch-all in
`netlify.toml` leaves `/study-notes/<slug>/` alone.

`netlify.toml` now runs this on every build:

```toml
command = "npm run build:notes && npm run build"
```

`--no-publish` is deliberate: the CI build must never flip `pages.status`.
Publishing stays an explicit author action you run locally.

To test the exact production output locally:

```powershell
npm run build:notes
npm run build
python -m http.server 8081 --directory dist
# open http://localhost:8081/study-notes/
```

### Hosting it on its own domain instead

```powershell
python generate_static.py --clean --out dist
```

Netlify: base directory `blog`, publish directory `dist`. Drop
`ARTICLE_BASE_PATH` (it defaults to empty) so links are root-relative.

### Serving under a different sub-path

```powershell
python generate_static.py --base-path /whatever
```

This rewrites every internal link, asset URL and the CSS reference, so the build
works from wherever you mount it. `ARTICLE_BASE_PATH` does the same for
`npm run build:notes`.

## Ad widgets

Two third-party ad units are embedded, both controlled by one switch:

| Placement | Where it goes |
| --- | --- |
| **Social bar** (`bauval.org/14/…`) | immediately before `</body>` |
| **Native banner** (`bauval.org/21/…`) in `<div id="container-…">` | below the article body on note pages, and below the listing on the index |

Both are defined as `SOCIAL_BAR_HTML` and `NATIVE_BANNER_HTML` near the top of
`generate_static.py` — edit those constants to swap networks or placements.

To build without them:

```powershell
python generate_static.py --no-ads      # or set ARTICLE_ADS=off
```

The native banner keeps its script *after* its container div, which is what the
network requires. `[id^="container-"]` in the stylesheet gives it spacing and a
minimum height without touching the markup the network injects into it.

Heads-up on reputation: ad scripts are external JavaScript on every page, and
deceptive ad units are a common reason Safe Browsing flags a domain. Keep that
in mind when choosing networks.

## Design notes

`assets/article.css` is a near copy of `src/theme/tokens.css` plus the article
rules from `src/components/ui/Markdown.module.css` and
`src/screens/blog/BlogPostScreen.module.css`. If you change a colour, spacing,
radius, shadow or typography token in the app, mirror it here so the static
notes stay in step. The Inter webfont, brand blue `#16248c`, subject pill and
primary button all match the in-app study surfaces. On screens 1200px and wider
the contents rail sticks to the left with the reading measure held at 76
characters, so a long note fills a laptop without a 110-character line.

Math is rendered with KaTeX using the same `$…$` / `$$…$$` delimiters the app's
Markdown component uses. Pass `--no-math` to drop the KaTeX dependency entirely
if your notes contain no LaTeX.

## Security

- `.env` holds service-role keys and API keys. It stays on the build machine
  only — never commit it, never expose it to the browser, and never add it to a
  Netlify environment variable that a build could print.
- All Markdown is HTML-escaped before rendering, so generated content cannot
  inject markup. Only `http`, `https`, `mailto`, and relative `#`/`/` link
  targets are kept; `javascript:` and `data:` URLs are dropped.
- `dist/_headers` sets `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy` and `Permissions-Policy`, and caches the asset folder
  immutably.
