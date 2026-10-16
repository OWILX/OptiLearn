#!/usr/bin/env python3
"""
Convert the generated study pages into a static, crawlable HTML article site.

Reads published rows from `public.pages` in the syllabus Supabase project (or a
local directory of markdown files), converts the markdown to HTML with the same
design tokens the app uses, and writes a ready-to-deploy static site.

Output:
  dist/index.html                 article index
  dist/articles/<slug>/index.html one page per article
  dist/assets/article.css         stylesheet (copied from blog/assets)
  dist/assets/logo.png            brand mark (copied from ../public when present)
  dist/sitemap.xml, dist/robots.txt, dist/_headers

Usage:
  python generate_static.py                      # build from Supabase
  python generate_static.py --limit 25           # build a subset
  python generate_static.py --slug gluteus-maximus-41
  python generate_static.py --source local --local-dir ./sample --out ./dist
  python generate_static.py --clean              # wipe dist/ first

The generated HTML contains no keys or secrets. Fetching happens at build time
with the server-side key only.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import logging
import os
import re
import shutil
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

from dotenv import load_dotenv

load_dotenv()
log = logging.getLogger("static")

# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #
HERE = Path(__file__).resolve().parent
OUT_DIR = HERE / "dist"
ASSET_DIR = HERE / "assets"
LOGO_SOURCE = HERE.parent / "public" / "avelune-logo.png"
FAVICON_SOURCE = HERE.parent / "public" / "favicon.svg"

PAGES_TABLE = "pages"
SITE_TITLE = "Avelune+ Study Notes"
SITE_TAGLINE = "Exam-focused review notes, organised by course, topic and module."
# Where the "practise" call to action points.
APP_URL = os.getenv("ARTICLE_APP_URL", "https://avelune-plus.netlify.app")
# Set this to the public origin of the deployed static site for canonical URLs.
SITE_URL = os.getenv("ARTICLE_SITE_URL", "").rstrip("/")

# Serve from a sub-path, e.g. /study-notes when embedded in the app's site.
BASE_PATH = os.getenv("ARTICLE_BASE_PATH", "").rstrip("/")

DATE_FORMAT = "%d %B %Y"

# Assets are served immutable, so the stylesheet is written under a content hash
# and referenced by that name. A CSS change then produces a new URL and every
# visitor picks it up immediately, instead of being stuck on a cached copy.
_CSS_HREF = "/assets/article.css"

# --------------------------------------------------------------------------- #
# Third-party monetization widgets (optional)
#
# Both are external JavaScript from the ad network. NOTE: these load onto every
# page, and Google Safe Browsing treats deceptive ad units as a social-
# engineering signal. If the site is already flagged, add them after the flag is
# cleared. Set ARTICLE_ADS=off to build without them (local preview, staging).
# --------------------------------------------------------------------------- #
ADS_ENABLED = os.getenv("ARTICLE_ADS", "on").strip().lower() not in (
    "off", "0", "false", "no",
)

# Placed immediately before the closing </body> tag.
SOCIAL_BAR_HTML = (
    '<script data-cfasync="false" '
    'src="https://bauval.org/14/0f612f8f17d033e832858f7119a5023f"></script>'
)

# Placed inside the page body. Order matters: the script must follow its
# container so the element exists when it executes.
NATIVE_BANNER_HTML = (
    '<script async="async" data-cfasync="false" '
    'src="https://bauval.org/21/45e8d497a5f84f33cbb0f02e30d35a5c"></script>\n'
    '    <div id="container-45e8d497a5f84f33cbb0f02e30d35a5c"></div>'
)


# --------------------------------------------------------------------------- #
# Small helpers
# --------------------------------------------------------------------------- #
def slugify(text: str) -> str:
    text = text.strip().lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-") or "section"


def excerpt(markdown: str, limit: int = 190) -> str:
    """Plain-text preview for the index list."""
    text = re.sub(r"```.*?```", " ", markdown, flags=re.S)
    text = re.sub(r"^\s*#{1,6}\s*.*$", " ", text, flags=re.M)  # headings
    text = re.sub(r"[*_`>|]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0]
    return f"{cut}…"


def format_date(value) -> str:
    if not value:
        return ""
    if isinstance(value, datetime):
        dt = value
    else:
        raw = str(value).replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(raw)
        except ValueError:
            return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.strftime(DATE_FORMAT)


def iso_date(value) -> str:
    """W3C date for <lastmod>. Accepts ISO timestamps or common written dates."""
    if not value:
        return ""
    if isinstance(value, datetime):
        dt = value
    else:
        raw = str(value).strip().replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(raw)
        except ValueError:
            try:
                dt = datetime.strptime(raw, "%d %B %Y").replace(tzinfo=timezone.utc)
            except ValueError:
                return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.date().isoformat()


# --------------------------------------------------------------------------- #
# Data loading
# --------------------------------------------------------------------------- #
PAGE_SIZE = 100  # keep each response small; large bodies drop the connection
FETCH_ATTEMPTS = 5
FETCH_BACKOFF_SECONDS = 2.0


def _fetch_pages(syl, only_slug: str | None, statuses: tuple[str, ...]) -> list[dict]:
    """Page through `pages` so no single response gets large enough to drop."""
    rows: list[dict] = []
    start = 0
    while True:
        query = syl.table(PAGES_TABLE).select(
            "slug, title, markdown, generated_at, status"
        ).in_("status", list(statuses))
        if only_slug:
            query = query.eq("slug", only_slug)
        response = query.order("slug").range(start, start + PAGE_SIZE - 1).execute()
        batch = response.data or []
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            return rows
        start += PAGE_SIZE


def _with_retry(operation, description: str):
    """Retry transient transport failures, e.g. WinError 10054 on a big response."""
    last_error: Exception | None = None
    for attempt in range(1, FETCH_ATTEMPTS + 1):
        try:
            return operation()
        except Exception as exc:  # noqa: BLE001 - any transport failure is retryable
            last_error = exc
            if attempt == FETCH_ATTEMPTS:
                break
            delay = FETCH_BACKOFF_SECONDS * attempt
            log.warning(
                "%s failed (attempt %d/%d): %s — retrying in %.0fs",
                description, attempt, FETCH_ATTEMPTS, exc, delay,
            )
            time.sleep(delay)
    raise last_error  # type: ignore[misc]


def load_pages_from_supabase(
    limit: int | None,
    only_slug: str | None,
    statuses: tuple[str, ...] = ("draft", "published"),
) -> list[dict]:
    """Read pages from `public.pages`. Server-side only; never expose these keys."""
    from supabase import create_client

    url = os.environ.get("SYLLABUS_SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SYLLABUS_SUPABASE_KEY")
    if not url or not key:
        log.error(
            "SYLLABUS_SUPABASE_URL and SYLLABUS_SUPABASE_KEY must be set "
            "(in blog/.env) to build from Supabase."
        )
        sys.exit(2)

    syl = create_client(url, key)
    rows = _with_retry(
        lambda: _fetch_pages(syl, only_slug, statuses), "Fetching pages"
    )
    if not rows:
        log.warning(
            "No pages matched status in %s. Drafts are built by default and are "
            "published once their HTML is written.", list(statuses)
        )

    pages = []
    for row in rows:
        markdown = (row.get("markdown") or "").strip()
        if not markdown:
            log.warning("Skipping %r: the markdown field is empty.", row.get("slug"))
            continue
        pages.append({
            "slug": row["slug"],
            "title": row["title"].strip(),
            "markdown": markdown,
            "date": format_date(row.get("generated_at")),
            "date_iso": iso_date(row.get("generated_at")),
            "subject": None,
            "course": None,
            "status": row.get("status"),
        })
    pages = _attach_subjects(syl, pages)
    if limit:
        pages = pages[:limit]
    return pages


def _attach_subjects(syl, pages: list[dict]) -> list[dict]:
    """Best-effort: subtopic -> topic -> course name, for the subject pill."""
    if not pages:
        return pages
    try:
        subtopic_rows = _with_retry(
            lambda: syl.table("subtopics").select("id, name, topic_id").execute().data or [],
            "Fetching subtopics",
        )
        by_name = {r["name"].strip().lower(): r for r in subtopic_rows if r.get("name")}

        topic_ids = [r["topic_id"] for r in by_name.values() if r.get("topic_id")]
        topic_rows = (
            _with_retry(
                lambda: syl.table("topics").select("id, name, course_id").in_("id", topic_ids).execute().data,
                "Fetching topics",
            ) if topic_ids else []
        )
        topics = {r["id"]: r for r in topic_rows}

        course_ids = [r["course_id"] for r in topics.values() if r.get("course_id")]
        course_rows = (
            _with_retry(
                lambda: syl.table("courses").select("id, name").in_("id", course_ids).execute().data,
                "Fetching courses",
            ) if course_ids else []
        )
        courses = {r["id"]: r for r in course_rows}

        for page in pages:
            subtopic = by_name.get(page["title"].lower())
            if not subtopic:
                continue
            topic = topics.get(subtopic.get("topic_id"))
            # Prefer the topic label: it is the level students navigate by.
            if topic:
                course = courses.get(topic.get("course_id"))
                page["subject"] = topic["name"]
                page["course"] = course["name"] if course else None
    except Exception as exc:  # noqa: BLE001 - the pill is decorative
        log.warning("Could not resolve subject names: %s", exc)
    return pages


def load_pages_from_local(directory: Path, limit: int | None) -> list[dict]:
    """Offline mode: read *.md files, optional front matter."""
    if not directory.is_dir():
        log.error("Local markdown directory not found: %s", directory)
        sys.exit(2)

    pages = []
    for path in sorted(directory.glob("*.md")):
        raw = path.read_text(encoding="utf-8")
        meta, body = _split_front_matter(raw)
        markdown = body.strip()
        if not markdown:
            continue
        title = meta.get("title") or _first_heading(markdown) or path.stem
        pages.append({
            "slug": meta.get("slug") or slugify(path.stem),
            "title": title,
            "markdown": markdown,
            "date": meta.get("date", ""),
            "date_iso": iso_date(meta.get("date", "")),
            "subject": meta.get("subject"),
            "course": meta.get("course"),
            "status": "published",
        })
    if limit:
        pages = pages[:limit]
    return pages


def _split_front_matter(raw: str) -> tuple[dict, str]:
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n", raw, flags=re.S)
    if not match:
        return {}, raw
    meta = {}
    for line in match.group(1).splitlines():
        if ":" in line:
            key, _, value = line.partition(":")
            meta[key.strip().lower()] = value.strip().strip("'\"")
    return meta, raw[match.end():]


def _first_heading(markdown: str) -> str | None:
    match = re.search(r"^#\s+(.+)$", markdown, flags=re.M)
    return match.group(1).strip() if match else None


# --------------------------------------------------------------------------- #
# Inline markdown -> HTML
# --------------------------------------------------------------------------- #
_PLACEHOLDER = "\x00{}\x00"
_PLACEHOLDER_RE = re.compile("\x00(\\d+)\x00")
_CODE_SPAN = re.compile(r"`([^`\n]+)`")
_INLINE_MATH = re.compile(r"(?<![\$\\])\$(?!\$)([^$\n]+?)\$(?!\$)")
_DISPLAY_MATH = re.compile(r"\$\$(.+?)\$\$", flags=re.S)
_BOLD = re.compile(r"\*\*(.+?)\*\*|__(.+?)__", flags=re.S)
_ITALIC = re.compile(r"(?<!\*)\*(?!\*)([^*\n]+?)\*(?!\*)|(?<!_)_(?!_)([^_\n]+?)_(?!_)")
_LINK = re.compile(r"\[([^\]]+)\]\(([^)\s]+)\)")
_SAFE_URL = re.compile(r"^(https?://|mailto:|/|#)", re.I)


def _render_inline(text: str) -> str:
    """Escape first, then apply inline markup. Nothing but our own tags survive."""
    stash: list[str] = []

    def protect(markup: str) -> str:
        stash.append(markup)
        return _PLACEHOLDER.format(len(stash) - 1)

    # 1. Inline code: keep verbatim, escape it ourselves.
    text = _CODE_SPAN.sub(lambda m: protect(
        f'<code>{html.escape(m.group(1), quote=False)}</code>'
    ), text)

    # 2. Math: stash the LaTeX so emphasis rules cannot touch it.
    text = _DISPLAY_MATH.sub(
        lambda m: protect(f"$${html.escape(m.group(1).strip(), quote=False)}$$"), text
    )
    text = _INLINE_MATH.sub(
        lambda m: protect(f"${html.escape(m.group(1).strip(), quote=False)}$"), text
    )

    # 3. Everything else is text: escape it.
    text = html.escape(text, quote=False)

    # 4. Emphasis, then links.
    text = _BOLD.sub(lambda m: f'<strong>{m.group(1) or m.group(2)}</strong>', text)
    text = _ITALIC.sub(lambda m: f'<em>{m.group(1) or m.group(2)}</em>', text)

    def link(match: re.Match) -> str:
        label, url = match.group(1), match.group(2)
        if not _SAFE_URL.match(url):
            return label  # drop unsafe hrefs (javascript:, data:, ...)
        return f'<a href="{url}">{label}</a>'

    text = _LINK.sub(link, text)

    # 5. Restore stashed code and math.
    text = _PLACEHOLDER_RE.sub(lambda m: stash[int(m.group(1))], text)
    return text


# --------------------------------------------------------------------------- #
# Block markdown -> HTML
# --------------------------------------------------------------------------- #
_HEADING = re.compile(r"^(#{1,6})\s+(.*)$")
_LIST_ITEM = re.compile(r"^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$")
_TABLE_SEPARATOR = re.compile(r"^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$")


def _is_table_separator(line: str) -> bool:
    stripped = line.strip()
    return bool(_TABLE_SEPARATOR.match(stripped)) and "|" in stripped


def _split_row(line: str) -> list[str]:
    stripped = line.strip()
    if stripped.startswith("|"):
        stripped = stripped[1:]
    if stripped.endswith("|"):
        stripped = stripped[:-1]
    return [cell.strip() for cell in stripped.split("|")]


def _alignment(separator: str) -> list[str]:
    aligns = []
    for cell in _split_row(separator):
        left = cell.startswith(":")
        right = cell.endswith(":")
        if left and right:
            aligns.append("center")
        elif right:
            aligns.append("right")
        else:
            aligns.append("")
    return aligns


def render_markdown(markdown: str) -> tuple[str, list[dict]]:
    """Return (html, toc) where toc is a list of {level, text, id}."""
    lines = markdown.splitlines()
    blocks: list[str] = []
    toc: list[dict] = []
    used_ids: dict[str, int] = {}

    def unique_id(text: str) -> str:
        base = slugify(text)
        count = used_ids.get(base, 0)
        used_ids[base] = count + 1
        return base if count == 0 else f"{base}-{count}"

    index = 0
    while index < len(lines):
        line = lines[index]
        stripped = line.strip()

        if not stripped:
            index += 1
            continue

        # Fenced code block (the generator should not emit these; be safe anyway)
        if stripped.startswith("```"):
            buffer = []
            index += 1
            while index < len(lines) and not lines[index].strip().startswith("```"):
                buffer.append(lines[index])
                index += 1
            index += 1
            blocks.append(
                "<pre><code>{}</code></pre>".format(html.escape("\n".join(buffer), quote=False))
            )
            continue

        # Heading
        heading = _HEADING.match(stripped)
        if heading:
            level = len(heading.group(1))
            text = heading.group(2).strip()
            if level == 1:
                # The template renders the canonical title; drop model-written H1s.
                index += 1
                continue
            anchor = unique_id(text)
            if level <= 3:
                toc.append({"level": level, "text": text, "id": anchor})
            blocks.append(
                f'<h{level} id="{anchor}">{_render_inline(text)}</h{level}>'
            )
            index += 1
            continue

        # Horizontal rule
        if re.fullmatch(r"(\*\s*){3,}|(-\s*){3,}|(_\s*){3,}", stripped):
            blocks.append("<hr />")
            index += 1
            continue

        # Table
        if "|" in line and index + 1 < len(lines) and _is_table_separator(lines[index + 1]):
            header = _split_row(line)
            aligns = _alignment(lines[index + 1])
            index += 2
            body_rows = []
            while index < len(lines) and "|" in lines[index] and lines[index].strip():
                body_rows.append(_split_row(lines[index]))
                index += 1

            def style_for(position: int) -> str:
                if position < len(aligns) and aligns[position]:
                    return f' style="text-align: {aligns[position]};"'
                return ""

            head = "".join(
                f"<th{style_for(i)}>{_render_inline(cell)}</th>"
                for i, cell in enumerate(header)
            )
            body = "".join(
                "<tr>{}</tr>".format(
                    "".join(
                        f"<td{style_for(i)}>{_render_inline(cell)}</td>"
                        for i, cell in enumerate(row)
                    )
                )
                for row in body_rows
            )
            blocks.append(
                f"<div class=\"table-wrap\"><table><thead><tr>{head}</tr></thead>"
                f"<tbody>{body}</tbody></table></div>"
            )
            continue

        # Blockquote
        if stripped.startswith(">"):
            buffer = []
            while index < len(lines) and lines[index].strip().startswith(">"):
                buffer.append(re.sub(r"^\s*>\s?", "", lines[index]))
                index += 1
            inner_html, _ = render_markdown("\n".join(buffer))
            blocks.append(f"<blockquote>\n{inner_html}\n</blockquote>")
            continue

        # List
        if _LIST_ITEM.match(line):
            items: list[tuple[int, bool, str]] = []
            while index < len(lines) and _LIST_ITEM.match(lines[index]):
                match = _LIST_ITEM.match(lines[index])
                indent = len(match.group(1).replace("\t", "  "))
                ordered = match.group(2) not in ("-", "*", "+")
                items.append((indent, ordered, match.group(3).strip()))
                index += 1
            rendered, _ = _render_list(items, 0, items[0][0])
            blocks.append(rendered)
            continue

        # Paragraph
        buffer = []
        while index < len(lines):
            current = lines[index]
            if (
                not current.strip()
                or current.strip().startswith(("#", ">", "```"))
                or _LIST_ITEM.match(current)
                or "|" in current
                and index + 1 < len(lines)
                and _is_table_separator(lines[index + 1])
            ):
                break
            buffer.append(current.strip())
            index += 1
        if buffer:
            blocks.append(f"<p>{_render_inline(' '.join(buffer))}</p>")

    return "\n".join(blocks), toc


def _render_list(items: list[tuple[int, bool, str]], position: int, indent: int):
    """Render one list level (plus any deeper nesting) recursively."""
    ordered = items[position][1]
    rendered_items: list[str] = []
    while position < len(items):
        item_indent, item_ordered, content = items[position]
        if item_indent != indent or item_ordered != ordered:
            break
        position += 1
        if position < len(items) and items[position][0] > indent:
            nested, position = _render_list(items, position, items[position][0])
            markup = f"{_render_inline(content)}\n{nested}"
        else:
            markup = _render_inline(content)
        rendered_items.append(f"<li>{markup}</li>")
    tag = "ol" if ordered else "ul"
    return f"<{tag}>\n" + "\n".join(rendered_items) + f"\n</{tag}>", position


# --------------------------------------------------------------------------- #
# Page templates
# --------------------------------------------------------------------------- #
def _head(title: str, description: str, canonical: str, extra_head: str = "") -> str:
    safe_title = html.escape(title, quote=True)
    safe_description = html.escape(description, quote=True)
    canonical_tag = (
        f'\n    <link rel="canonical" href="{html.escape(canonical, quote=True)}" />'
        if canonical else ""
    )
    global _CSS_HREF
    css_href = _CSS_HREF
    favicon_href = _path("assets", "favicon.svg")
    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>{safe_title}</title>
    <meta name="description" content="{safe_description}" />
    <meta name="theme-color" content="#16248c" />
    <link rel="icon" type="image/svg+xml" href="{favicon_href}" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="{css_href}" />{extra_head}{canonical_tag}
  </head>"""


def _header(active: str = "") -> str:
    home = _path("")
    logo = _path("assets", "logo.png")
    return """  <body>
    <header class="site-header">
      <div class="site-header__inner">
        <a class="brand" href="{home}">
          <img class="brand__mark" src="{logo}" alt="" width="28" height="28" />
          <span class="brand__name">Avelune+</span>
        </a>
        <nav class="site-nav">
          <a href="{home}">Notes</a>
          <a href="{app}" rel="noopener">Open app</a>
        </nav>
      </div>
    </header>""".format(
        home=home, logo=logo, app=html.escape(APP_URL, quote=True)
    )


def _footer() -> str:
    # The social bar belongs last, just above </body>.
    social_bar = f"\n    {SOCIAL_BAR_HTML}" if ADS_ENABLED else ""
    return f"""    <footer class="site-footer">
      <div class="site-footer__inner">
        <span>© {datetime.now(timezone.utc).year} Avelune+ · Exam-focused study notes</span>
        <a href="{html.escape(APP_URL, quote=True)}" rel="noopener">Practise on Avelune+</a>
      </div>
    </footer>{social_bar}
  </body>
</html>"""


def _toc_html(toc: list[dict]) -> str:
    if len(toc) < 3:
        return ""
    entries = []
    for item in toc:
        classes = "toc__level-3" if item["level"] >= 3 else ""
        entries.append(
            f'<li class="{classes}"><a href="#{item["id"]}">'
            f'{html.escape(item["text"])}</a></li>'
        )
    return (
        '<nav class="toc" aria-label="Contents">'
        '<p class="toc__label">On this page</p>'
        f'<ol>{"".join(entries)}</ol></nav>'
    )


def _native_banner() -> str:
    """The in-body native ad unit. Empty string when ads are switched off."""
    return f"      {NATIVE_BANNER_HTML}\n" if ADS_ENABLED else ""


def _article_jsonld(page: dict, canonical: str) -> str:
    data = {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": page["title"],
        "articleSection": page.get("subject") or "Study notes",
        "publisher": {"@type": "Organization", "name": "Avelune+"},
    }
    if page.get("date"):
        data["datePublished"] = page["date"]
    if canonical:
        data["url"] = canonical
        data["mainEntityOfPage"] = {"@type": "WebPage", "@id": canonical}
    return (
        '<script type="application/ld+json">'
        + json.dumps(data, ensure_ascii=False)
        + "</script>"
    )


KATEX_HEAD = """    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css"
      integrity="sha384-n8MVd4RsNIU0tAv4ct0nTaAbDJwPJzDEaqSD1odI+WdtXRGWt2kTvGFasHpSy3SV"
      crossorigin="anonymous"
    />
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"
      integrity="sha384-XjKyOOlGwcjNTAIQHIpgOno0Hl1YQqzUOEleOLALmuqehneUG+vnGctmUb0ZY0l8"
      crossorigin="anonymous"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"
      integrity="sha384-+VBxd3r6XgURycqtZ117nYw44OOcIax56Z4dCRWbxyPt0Koah1uHoK0o4+/RRE05"
      crossorigin="anonymous"
      onload="renderMathInElement(document.body, {delimiters: [{left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false}], ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']});"></script>"""


def render_article(page: dict, base_url: str, with_math: bool) -> str:
    body_html, toc = render_markdown(page["markdown"])
    canonical = f"{base_url}/articles/{page['slug']}/" if base_url else ""
    subject = page.get("subject")
    description = excerpt(page["markdown"], 155)

    head = _head(
        f"{page['title']} · {SITE_TITLE}",
        description,
        canonical,
        KATEX_HEAD if with_math else "",
    )

    parts = [head, _header()]
    parts.append('    <main class="page">\n      <div class="article-layout">')

    toc_html = _toc_html(toc)
    if toc_html:
        # Left rail on wide screens, inline above the body otherwise.
        parts.append(f"      {toc_html}")

    parts.append('      <div class="article-main">')
    parts.append('        <article class="article">')
    if subject:
        parts.append(f'          <span class="article__subject">{html.escape(subject)}</span>')
    parts.append(f"          <h1 class=\"article__title\">{html.escape(page['title'])}</h1>")
    if page.get("date"):
        parts.append(
            '          <p class="article__meta">Avelune+ study notes'
            + (f" · {html.escape(page['date'])}" if page["date"] else "")
            + "</p>"
        )
    parts.append('          <hr class="article__rule" />')
    parts.append("        </article>")
    parts.append(f'        <div class="md">\n{body_html}\n        </div>')

    # Native banner sits below the article, above the call to action.
    parts.append(_native_banner())

    parts.append(f"""      <aside class="cta">
        <h2 class="cta__title">Put this into practice</h2>
        <p class="cta__text">Test yourself on this topic with timed quizzes, spaced
          repetition and instant explanations on Avelune+.</p>
        <a class="cta__button" href="{html.escape(APP_URL, quote=True)}" rel="noopener">
          Start practising</a>
      </aside>
      </div>
    </main>""")

    parts.append(_article_jsonld(page, canonical))
    parts.append(_footer())
    return "\n".join(parts) + "\n"


def _search_haystack(page: dict) -> str:
    """Text the client-side search matches against: title, labels, headings."""
    headings = re.findall(r"^#{2,3}\s+(.+)$", page["markdown"], flags=re.M)
    parts = [
        page["title"],
        page.get("subject") or "",
        page.get("course") or "",
        page["slug"].replace("-", " "),
        " ".join(headings),
    ]
    return re.sub(r"\s+", " ", " ".join(parts)).lower()


def render_index(pages: list[dict], base_url: str) -> str:
    canonical = f"{base_url}/" if base_url else ""
    head = _head(
        f"{SITE_TITLE} · Clear, exam-focused review notes",
        SITE_TAGLINE,
        canonical,
    )
    parts = [head, _header(active="index")]
    parts.append(f"""    <main class="page page--index">
      <div class="index-head">
        <div>
          <h1 class="index-title">Study notes</h1>
          <p class="intro">{SITE_TAGLINE} Every note is broken down into modules
            and bullet-point concepts so you can revise fast and test yourself
            on Avelune+.</p>
        </div>
        <div class="search">
          <label class="search__label" for="search-input">Find a note</label>
          <input
            id="search-input"
            class="search__input"
            type="search"
            placeholder="Search topics, subjects or modules…"
            autocomplete="off"
            spellcheck="false"
          />
          <p class="search__status" id="search-status" role="status" aria-live="polite"></p>
        </div>
      </div>""")

    if not pages:
        parts.append('      <p class="empty">No published notes yet.</p>')
    else:
        groups: dict[str, list[dict]] = {}
        for page in pages:
            groups.setdefault(page.get("subject") or "Other notes", []).append(page)

        for subject in sorted(groups, key=str.lower):
            members = groups[subject]
            parts.append(f'      <section class="group" data-subject="{html.escape(subject)}">')
            parts.append(
                f'        <h2 class="group__title">{html.escape(subject)}'
                f'<span class="group__count">{len(members)}</span></h2>'
            )
            parts.append('        <ul class="article-list">')
            for page in members:
                href = _path("articles", quote(page["slug"])) + "/"
                course = page.get("course")
                kicker = course or page.get("subject") or ""
                kicker_html = (
                    f'<span class="article-card__subject">{html.escape(kicker)}</span>'
                    if kicker else ""
                )
                parts.append(
                    f'          <li><a class="article-card" href="{href}"'
                    f' data-haystack="{html.escape(_search_haystack(page), quote=True)}">'
                    f"{kicker_html}"
                    f'<h3 class="article-card__title">{html.escape(page["title"])}</h3>'
                    f'<p class="article-card__excerpt">{html.escape(excerpt(page["markdown"]))}</p>'
                    f"</a></li>"
                )
            parts.append("        </ul>")
            parts.append("      </section>")

        parts.append('      <p class="empty search__empty" id="search-empty" hidden>'
                     "No notes match your search. Try a different word, or clear the box."
                     "</p>")

        # Native banner below the listing, before the footer.
        parts.append(_native_banner())

    parts.append("    </main>")
    parts.append(SEARCH_SCRIPT)
    parts.append(_footer())
    return "\n".join(parts) + "\n"


SEARCH_SCRIPT = """    <script>
(function () {
  var input = document.getElementById('search-input');
  if (!input) return;
  var cards = Array.prototype.slice.call(document.querySelectorAll('.article-card'));
  var groups = Array.prototype.slice.call(document.querySelectorAll('.group'));
  var empty = document.getElementById('search-empty');
  var status = document.getElementById('search-status');
  var total = cards.length;

  function shown() {
    return cards.filter(function (card) { return !card.parentElement.hidden; }).length;
  }

  function update() {
    var query = input.value.trim().toLowerCase();
    var terms = query.split(/\\s+/).filter(Boolean);

    cards.forEach(function (card) {
      var haystack = card.getAttribute('data-haystack') || '';
      var match = terms.every(function (term) {
        return haystack.indexOf(term) !== -1;
      });
      card.parentElement.hidden = !match;
    });

    // Hide a subject section once none of its notes match.
    var visibleGroups = 0;
    groups.forEach(function (group) {
      var items = group.querySelectorAll('li');
      var visible = 0;
      for (var i = 0; i < items.length; i += 1) {
        if (!items[i].hidden) visible += 1;
      }
      group.hidden = visible === 0;
      if (visible > 0) visibleGroups += 1;
    });

    if (empty) empty.hidden = query.length !== 0 && shown() !== 0;
    if (status) {
      status.textContent = query.length === 0
        ? total + ' note' + (total === 1 ? '' : 's')
        : shown() + ' of ' + total + ' in ' + visibleGroups +
          ' subject' + (visibleGroups === 1 ? '' : 's');
    }
  }

  input.addEventListener('input', update);
  input.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') { input.value = ''; update(); }
  });
  // "/" focuses search from anywhere on the page.
  document.addEventListener('keydown', function (event) {
    if (event.key === '/' && document.activeElement !== input) {
      event.preventDefault();
      input.focus();
    }
  });
  update();
})();
    </script>
"""


# --------------------------------------------------------------------------- #
# Site writing
# --------------------------------------------------------------------------- #
ROBOTS = """User-agent: *
Allow: /
"""


class PagePublisher:
    """Mark a page 'published' only after its static HTML is safely on disk.

    This is what makes the two states agree: a row is 'published' in the
    database exactly when it exists as a static page.
    """

    def __init__(self, url: str, key: str):
        from supabase import create_client
        self._client = create_client(url, key)

    def publish(self, slug: str) -> None:
        try:
            self._client.table(PAGES_TABLE).update({"status": "published"}) \
                .eq("slug", slug).eq("status", "draft").execute()
        except Exception as exc:  # noqa: BLE001 - report and keep building
            log.warning("Could not mark %s as published: %s", slug, exc)



def _path(*segments: str) -> str:
    """Internal URLs honour ARTICLE_BASE_PATH so the site can be embedded."""
    return BASE_PATH + "/" + "/".join(segment.strip("/") for segment in segments)


def _write_stylesheet(out: Path) -> None:
    """Write the CSS under a content hash and point the templates at it.

    `/assets/*` is served immutable (see `_headers`), so the filename has to
    change whenever the CSS changes or returning visitors keep a stale
    stylesheet forever.
    """
    global _CSS_HREF
    css_source = ASSET_DIR / "article.css"
    if not css_source.is_file():
        log.warning("Missing stylesheet: %s", css_source)
        return

    css_bytes = css_source.read_bytes()
    digest = hashlib.sha256(css_bytes).hexdigest()[:10]
    fingerprinted = f"article.{digest}.css"
    (out / "assets" / fingerprinted).write_bytes(css_bytes)
    # A stable name too, so the file is easy to open and inspect by hand.
    (out / "assets" / "article.css").write_bytes(css_bytes)
    _CSS_HREF = _path("assets", fingerprinted)
    log.info("Stylesheet: %s", _CSS_HREF)


def write_site(
    pages: list[dict],
    out: Path,
    clean: bool,
    with_math: bool,
    publisher: "PagePublisher | None" = None,
) -> None:
    if clean and out.exists():
        shutil.rmtree(out)
    (out / "articles").mkdir(parents=True, exist_ok=True)
    (out / "assets").mkdir(parents=True, exist_ok=True)

    # Fingerprint the stylesheet first: every page rendered below references it,
    # and the immutable cache header means the filename must change on edit.
    _write_stylesheet(out)

    base_url = SITE_URL
    published_now = 0

    for page in pages:
        page_dir = out / "articles" / quote(page["slug"])
        page_dir.mkdir(parents=True, exist_ok=True)
        (page_dir / "index.html").write_text(
            render_article(page, base_url, with_math), encoding="utf-8"
        )
        if publisher and page.get("status") != "published":
            publisher.publish(page["slug"])
            published_now += 1
            log.info("published: %s", page["slug"])

    (out / "index.html").write_text(render_index(pages, base_url), encoding="utf-8")

    for source, name in ((LOGO_SOURCE, "logo.png"), (FAVICON_SOURCE, "favicon.svg")):
        if source.is_file():
            shutil.copyfile(source, out / "assets" / name)
        else:
            log.warning("Missing asset: %s", source)

    robots = ROBOTS
    if base_url:
        robots += f"\nSitemap: {base_url}/sitemap.xml\n"
    (out / "robots.txt").write_text(robots, encoding="utf-8")

    if base_url:
        urls = "".join(
            f"  <url><loc>{base_url}/articles/{quote(p['slug'])}/</loc>"
            + (f"<lastmod>{p['date_iso']}</lastmod>" if p.get("date_iso") else "")
            + "</url>\n"
            for p in pages
        )
        sitemap = (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            f"  <url><loc>{base_url}/</loc></url>\n"
            f"{urls}</urlset>\n"
        )
        (out / "sitemap.xml").write_text(sitemap, encoding="utf-8")

    (out / "_headers").write_text(
        """/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=()

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/*.html
  Cache-Control: public, max-age=0, must-revalidate
""",
        encoding="utf-8",
    )

    log.info("Wrote %d article page(s) to %s", len(pages), out)
    if publisher and published_now:
        log.info("Marked %d page(s) as published in Supabase", published_now)


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--source", choices=("supabase", "local"), default="supabase")
    parser.add_argument("--local-dir", type=Path, default=HERE / "sample",
                        help="markdown directory when --source local")
    parser.add_argument("--out", type=Path, default=OUT_DIR)
    parser.add_argument("--base-path", default=os.getenv("ARTICLE_BASE_PATH", ""),
                        help="sub-path to serve from, e.g. /study-notes")
    parser.add_argument("--no-ads", action="store_true",
                        help="omit the third-party ad widgets")
    parser.add_argument("--limit", type=int, help="build at most N pages")
    parser.add_argument("--slug", help="build a single page by slug")
    parser.add_argument("--clean", action="store_true", help="wipe the output first")
    parser.add_argument("--only-new", action="store_true",
                        help="build only pages still in 'draft' (a re-run rebuilds "
                             "everything by default, which is what a full site needs)")
    parser.add_argument("--no-publish", action="store_true",
                        help="do not flip built pages to 'published' in Supabase")
    parser.add_argument("--no-math", action="store_true",
                        help="skip KaTeX (use when notes contain no LaTeX)")
    return parser.parse_args()


def main() -> None:
    global BASE_PATH, ADS_ENABLED
    args = parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    if args.base_path:
        BASE_PATH = args.base_path.rstrip("/")
    if args.no_ads or os.getenv("ARTICLE_ADS", "on").strip().lower() in (
        "off", "0", "false", "no",
    ):
        ADS_ENABLED = False

    publisher = None
    if args.source == "local":
        pages = load_pages_from_local(args.local_dir, args.limit)
    else:
        pages = load_pages_from_supabase(
            args.limit,
            args.slug,
            ("draft",) if args.only_new else ("draft", "published"),
        )
        if not args.no_publish and pages:
            publisher = PagePublisher(
                os.environ["SYLLABUS_SUPABASE_URL"],
                os.environ["SYLLABUS_SUPABASE_KEY"],
            )

    if not pages:
        log.warning("Nothing to build. Mark pages as status = 'published' to include them.")
    write_site(pages, args.out, args.clean, with_math=not args.no_math, publisher=publisher)

    if BASE_PATH:
        log.info(
            "Serving under %s — links, assets and canonical URLs use that prefix.",
            BASE_PATH,
        )
    if not SITE_URL:
        log.info(
            "Tip: set ARTICLE_SITE_URL (e.g. https://notes.avelune.app) for canonical "
            "URLs, sitemap.xml and Open Graph links."
        )
    if not ADS_ENABLED:
        log.info("Ad widgets omitted (--no-ads / ARTICLE_ADS=off).")


if __name__ == "__main__":
    main()
