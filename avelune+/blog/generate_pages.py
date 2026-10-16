#!/usr/bin/env python3
"""
Generate one exam-focused, Wikipedia-style markdown page per syllabus subtopic.

Per subtopic:
  1. Embed one query per module + one for the subtopic (NVIDIA NIM embeddings).
  2. Search the study-docs project through the pgvector match RPC:
     K_MODULE chunks per module, then K_SUBTOPIC subtopic-level chunks.
  3. Ask the River.ai chat model to fill a fixed page template (strict Markdown).
  4. Validate the structure (re-ask with feedback if it drifts), then upsert into `pages`.

Progress lives in `page_generation_jobs`, so the script is safe to stop and re-run.

Usage:
  python generate_pages.py --limit 3          # try a few first
  python generate_pages.py                    # everything pending / retryable
  python generate_pages.py --course 2         # one course only
  python generate_pages.py --subtopic 41 --force   # regenerate one page
  python generate_pages.py --reset-failed     # give failed jobs a fresh set of attempts
"""
import argparse
import hashlib
import json
import logging
import os
import re
import sys
import time
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from openai import OpenAI
from supabase import create_client

load_dotenv()
log = logging.getLogger("pages")

# --------------------------------------------------------------------------- #
# Config: edit these to match your projects
# --------------------------------------------------------------------------- #
# Syllabus project (also holds the output tables)
T_COURSES, T_TOPICS, T_SUBTOPICS, T_MODULES = "courses", "topics", "subtopics", "modules"
NAME_COL = "name"
FK_TOPIC_COURSE = "course_id"        # topics.<this>    -> courses.id
FK_SUBTOPIC_TOPIC = "topic_id"       # subtopics.<this> -> topics.id
FK_MODULE_SUBTOPIC = "subtopic_id"   # modules.<this>   -> subtopics.id
MODULE_ORDER_COL = "id"              # column giving syllabus order, e.g. "position"
PAGES, JOBS = "pages", "page_generation_jobs"

# Study-docs project: pgvector match RPC
RPC_NAME = os.getenv("RPC_NAME", "search_document_chunks")
RPC_QUERY_PARAM = "query_embedding"
RPC_COUNT_PARAM = "match_count"
RPC_EXTRA_PARAMS = json.loads(os.getenv("RPC_EXTRA_PARAMS", "{}"))  # e.g. {"match_threshold": 0.3}
CHUNK_TEXT_KEY = "chunk_text"  # must match the column name in your study-docs project
CHUNK_ID_KEY = "id"
K_MODULE = int(os.getenv("K_MODULE", 4))        # 3-5
K_SUBTOPIC = int(os.getenv("K_SUBTOPIC", 4))    # 3-5
MAX_CHUNK_CHARS = 1800

# --------------------------------------------------------------------------- #
# NVIDIA NIM — embeddings only
# --------------------------------------------------------------------------- #
NIM_BASE_URL = os.getenv("NIM_BASE_URL", "https://integrate.api.nvidia.com/v1")
# Must match the model used to index your study documents.
EMBED_MODEL = os.getenv("EMBED_MODEL", "nvidia/nemotron-3-embed-1b")
# Nemotron-3-Embed-1B expects input_type and truncate.
EMBED_EXTRA_BODY = json.loads(
    os.getenv("EMBED_EXTRA_BODY", '{"input_type": "query", "truncate": "END"}')
)

# --------------------------------------------------------------------------- #
# River.ai — generation only
# --------------------------------------------------------------------------- #
RIVER_BASE_URL = os.getenv("RIVER_BASE_URL", "https://api.river.ai/v1")
GEN_MODEL = os.getenv("GEN_MODEL", "your-river-model-name")
GEN_TEMPERATURE = 0.3
GEN_MAX_TOKENS_CAP = 131072
MAX_GEN_ATTEMPTS = 3        # re-asks per job when validation fails

# Job control
MAX_JOB_ATTEMPTS = 3        # failed jobs are retried until this many attempts
STALE_MINUTES = 30          # a 'running' job older than this is assumed crashed
DELAY_SECONDS = float(os.getenv("DELAY_SECONDS", 1.0))  # pause between subtopics (rate limits)
PROMPT_VERSION = "v1"       # bump when you change the prompts below
MIN_SECTION_CHARS = 60

# --------------------------------------------------------------------------- #
# Prompts
# --------------------------------------------------------------------------- #
MODULE_QUERY = "{module} - {subtopic} ({topic}, {course})"
SUBTOPIC_QUERY = "Overview of {subtopic} ({topic}, {course})"

SYSTEM_PROMPT = """
You are an expert academic author creating engaging, high-quality educational review material inspired by the structured, bullet-oriented presentation of BRS and High-Yield review textbooks.

Your task is to transform the provided guiding topics, module titles, and page template into a comprehensive, easy-to-read reference page. The final output must be **highly structured, point-by-point, predominantly bulleted, and broken down into digestible units of information.**

## 1. Follow the Guiding Topics

- Treat the supplied guiding topics and module titles as the primary guide for what to cover.
- Identify the important concepts belonging to each module and explain them thoroughly.
- Do not depend on the supplied context being complete. Use established domain knowledge to fill necessary gaps, provide missing background, clarify terminology, and explain concepts sufficiently for the page to stand alone.
- Cover the full scope of each topic without drifting into unrelated material.
- Give complex and important concepts adequate detail. Keep straightforward concepts concise.
- Connect related concepts where doing so improves understanding.

## 2. Break Everything Down

**Do not write prose-heavy textbook sections. Break the content into clear, digestible points.**

- Present information primarily through bullet lists and nested bullet lists.
- Break down complex explanations into their individual concepts, components, characteristics, stages, mechanisms, and consequences.
- Give each bullet one main idea, with nested bullets for its supporting details.
- Divide lengthy explanations into smaller, logically connected points.
- Use short, meaningful phrases and sentences. Avoid dense paragraphs containing multiple unrelated facts.
- Do not compress several distinct concepts into a single oversized bullet.
- Do not fragment information so aggressively that bullets become meaningless or lose necessary explanations.
- Explain each point sufficiently to make it understandable without requiring the reader to infer missing steps.
- Use bold text to highlight important terms, structures, processes, classifications, and distinctions.

**The rule is simple: if an explanation contains multiple ideas, break it down.**

## 3. Organize Every Module Internally

Every module must be organized according to its content rather than presented as one continuous block of text.

- Identify the distinct concepts within the module.
- Introduce each conceptual group using a short **bold label on its own line**.
- Place the relevant information beneath that label using bullets and nested bullets.
- Use bold labels for internal grouping only. Do not introduce new Markdown headings or numbered sections inside a module.
- Use as many groups as the material genuinely requires.
- Do not force every module into the same number of groups.
- For simple topics, use a short, flat bullet list.
- For complex topics, break the content into multiple groups with nested details.
- Never create artificial subdivisions merely to fill space.

For example, a module about a bone might be organized into relevant groups such as:

**Identification and orientation**
- Type and location of the bone.
- Features used to determine its side.
- Important distinguishing characteristics.

**Anatomical features**
- **Head:** Location, articulations, and relevant characteristics.
- **Shaft:** Surfaces, borders, and important landmarks.
- **Distal end:** Components, articulations, and distinguishing features.

**Articulations and functions**
- Joint formations.
- Movements permitted.
- Functional relationships.

**Clinical correlations**
- Important fractures or injuries.
- Structures at risk.
- Relevant consequences.

These labels are illustrative, not mandatory. Select and adapt groupings to suit the actual module. Include only relevant details and use background knowledge when necessary to complete the explanations.

## 4. Explain Each Concept Point by Point

Use the following structures where appropriate. Do not force every structure onto every topic.

**For definitions**
- **Definition:** What the concept is.
- **Location or components:** Where it occurs or what it consists of.
- **Function or significance:** What it does or why it matters.

**For mechanisms and processes**
- **Initiating event:** What starts the process.
- **Sequence:** What happens at each stage.
- **Mechanism:** How and why the changes occur.
- **Outcome:** What the process produces.
- Use numbered lists or arrows (`→`) when they make the sequence clearer.

**For classifications**
- State the basis of classification.
- Identify each category.
- Explain the defining features of each category.
- Distinguish categories where necessary.

**For anatomical structures**
- **Location**
- **Parts and features**
- **Attachments**
- **Relations**
- **Blood supply and innervation**, where relevant
- **Functions and movements**
- **Clinical significance**

Adapt the categories to the topic. Do not include irrelevant categories simply to complete a checklist.

**For comparisons**
- Present similarities and differences explicitly.
- Use a Markdown table when it makes the comparison easier to understand.
- Otherwise, use parallel bullet lists.

## 5. Make the Material Easy to Read

- Avoid introductory paragraphs that merely announce what a module will discuss.
- Avoid long blocks of prose, even at the beginning of a section.
- Begin with the essential concept, followed by its details.
- Keep individual bullets relatively short and focused.
- Use nested bullets to distinguish main points from supporting information.
- Bold key terminology, but do not bold entire paragraphs or every other phrase.
- Use tables selectively for compact comparisons, not as a replacement for explanation.
- Use arrows for pathways, sequences, and cause-and-effect relationships.
- Avoid repetitive explanations, filler, generic introductions, and unnecessary conclusions.
- Ensure that each group can be scanned quickly while remaining understandable on its own.
- Maintain a logical progression from foundational concepts to their more detailed aspects.

The page should feel like a carefully organized review resource, not an essay that has been converted into bullets.

## 6. Maintain Academic Accuracy and Depth

- Define technical terms clearly.
- Explain mechanisms rather than merely naming them.
- Preserve important distinctions, exceptions, and qualifications.
- Include relevant relationships between structure and function, cause and effect, and components and outcomes.
- Use accurate and consistent terminology.
- Complete missing contextual explanations using established domain knowledge when necessary.
- Do not invent citations, references, statistics, or unsupported claims.
- Do not introduce unrelated facts simply to increase the page length.

## 7. Prohibited Writing Styles

- No long, prose-heavy sections.
- No oversized bullets containing several disconnected ideas.
- No unexplained lists of technical terms.
- No repetitive explanations of the same concept.
- No conversational language, rhetorical questions, or motivational filler.
- No statements such as "in an exam," "an examiner may ask," "examiners expect," or "students should memorize."
- No references to images, diagrams, figures, or tables that were not actually generated and included in the page.
- No references to supplied excerpts, source documents, missing context, or the writing process.
- No invented visual aids or external references.

## 8. Preserve the Page Template

- Follow the supplied template exactly.
- Preserve all specified headings, subheadings, numbering, and ordering.
- Do not add, remove, rename, merge, split, or reorder template headings.
- Do not introduce new Markdown headings inside modules.
- Use bold labels and nested bullets for internal organization.
- Do not write a top-level `#` title because the title is added automatically.
- Use Markdown exclusively.

## 9. Output Requirements

Return only the completed Markdown page.

Do not include a preamble, closing remarks, editorial notes, citations, source attributions, HTML, or code fences around the page.

**Final quality standard:** Every module must be broken down into its essential concepts. Every complex concept must be broken down into its constituent details. Every mechanism must be explained in a logical sequence. Every classification must be clearly organized. Every comparison must make the differences apparent.

The result should be comprehensive without being cumbersome, detailed without being dense, and structured without being mechanical. Prioritize **clear headings from the original template, bold internal labels, concise bullets, meaningful nesting, and point-by-point explanations**. Make the material easy to navigate, easy to understand, and inviting to read.
"""


def build_prompt(course, topic, subtopic, modules, module_chunks, subtopic_chunks):
    skeleton = (
        "## Introduction\n"
        "<2-3 paragraphs: what this subtopic covers, why it matters, how its modules fit "
        "together, and what a student should be able to do in an exam.>\n\n"
        "## Modules\n\n"
        + "\n\n".join(
            f"### {m[NAME_COL]}\n"
            "<Break this module into its essential concepts using bold labels and bullets.>"
            for m in modules
        )
    )

    def fmt(chunks):
        if not chunks:
            return "(no relevant excerpts found)"
        return "\n".join(f"<excerpt>\n{c['text']}\n</excerpt>" for c in chunks)

    module_blocks = "\n\n".join(
        f"### Excerpts for module: {m[NAME_COL]}\n{fmt(module_chunks[m['id']])}" for m in modules
    )

    return f"""Write the study page for this subtopic.

Course: {course[NAME_COL]}
Topic: {topic[NAME_COL]}
Subtopic: {subtopic[NAME_COL]}

PAGE TEMPLATE (copy every heading exactly as written; replace only the <...> parts, and repeat the
paragraph + "Exam focus" block for each module heading shown):

{skeleton}

SOURCE EXCERPTS

### Subtopic-level excerpts
{fmt(subtopic_chunks)}

{module_blocks}
"""


# --------------------------------------------------------------------------- #
# Small helpers
# --------------------------------------------------------------------------- #
class ValidationError(Exception):
    pass


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def chunked(items, n):
    items = list(items)
    for i in range(0, len(items), n):
        yield items[i:i + n]


def slugify(text):
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "page"


def make_slug(name, subtopic_id):
    # Deterministic and collision-proof. Change if you prefer cleaner URLs.
    return f"{slugify(name)}-{subtopic_id}"


def fetch_all(client, table, select="*", order="id", apply=None, page=1000):
    """Page through a table (PostgREST caps responses at 1000 rows by default)."""
    rows, start = [], 0
    while True:
        q = client.table(table).select(select)
        if apply:
            q = apply(q)
        data = q.order(order).range(start, start + page - 1).execute().data or []
        rows.extend(data)
        if len(data) < page:
            return rows
        start += page


# --------------------------------------------------------------------------- #
# Retrieval
# --------------------------------------------------------------------------- #
def embed(embed_client, texts):
    out = []
    for batch in chunked(texts, 32):
        resp = embed_client.embeddings.create(
            model=EMBED_MODEL,
            input=batch,
            encoding_format="float",
            extra_body=EMBED_EXTRA_BODY,
        )
        out.extend(d.embedding for d in sorted(resp.data, key=lambda d: d.index))
    return out

def search_chunks(docs, embedding, k, course=None, topic=None):
    params = {
        RPC_QUERY_PARAM: embedding,
        RPC_COUNT_PARAM: k,
        **RPC_EXTRA_PARAMS,
    }
    if course is not None:
        params["course_filter"] = course
    if topic is not None:
        params["topic_filter"] = topic

    rows = docs.rpc(RPC_NAME, params).execute().data or []

    # --- DEBUG: remove after diagnosing ---
    if rows:
        print("RPC filters -> course:", repr(course), "| topic:", repr(topic))
    else:
        print("RPC returned 0 rows. filters -> course:", repr(course), "| topic:", repr(topic))
    # --------------------------------------

    chunks = []
    for r in rows:
        text = (r.get(CHUNK_TEXT_KEY) or "").strip()
        if not text:
            continue
        cid = r.get(CHUNK_ID_KEY) or hashlib.sha1(text.encode()).hexdigest()[:12]
        chunks.append({"id": str(cid), "text": text[:MAX_CHUNK_CHARS]})
    return chunks


def gather_context(docs, embed_client, course, topic, subtopic, modules):
    queries = [
        MODULE_QUERY.format(module=m[NAME_COL], subtopic=subtopic[NAME_COL],
                            topic=topic[NAME_COL], course=course[NAME_COL])
        for m in modules
    ] + [SUBTOPIC_QUERY.format(subtopic=subtopic[NAME_COL], topic=topic[NAME_COL],
                               course=course[NAME_COL])]
    vecs = embed(embed_client, queries)

    course_name = course[NAME_COL]
    topic_name = topic[NAME_COL]

    module_chunks = {
        m["id"]: search_chunks(docs, v, K_MODULE,
                               course=course_name, topic=topic_name)
        for m, v in zip(modules, vecs)
    }

    used = {c["id"] for cs in module_chunks.values() for c in cs}
    extra = search_chunks(docs, vecs[-1], K_SUBTOPIC + 4,
                          course=course_name, topic=topic_name)
    subtopic_chunks = [c for c in extra if c["id"] not in used][:K_SUBTOPIC]
    return module_chunks, subtopic_chunks

# --------------------------------------------------------------------------- #
# Generation + validation
# --------------------------------------------------------------------------- #
def normalize(raw, title):
    md = re.sub(r"<think>.*?</think>", "", raw, flags=re.S).strip()   # reasoning models
    fenced = re.fullmatch(r"```[A-Za-z]*\n(.*)\n```", md, flags=re.S)  # model wrapped the page in a fence
    if fenced:
        md = fenced.group(1).strip()
    m = re.search(r"^## Introduction[ \t]*$", md, flags=re.M)
    if not m:
        raise ValidationError("missing the '## Introduction' heading")
    # Drop any preamble / model-written H1; the canonical H1 is added by us.
    return f"# {title}\n\n{md[m.start():].rstrip()}\n"


def validate(md, module_names):
    errors = []
    if len(re.findall(r"^# ", md, flags=re.M)) != 1:
        errors.append("only one '#' title is allowed and it is added automatically")
    h2 = re.findall(r"^## (.+?)\s*$", md, flags=re.M)
    if h2 != ["Introduction", "Modules"]:
        errors.append(f"level-2 headings must be exactly ['Introduction', 'Modules'], got {h2}")
    h3 = re.findall(r"^### (.+?)\s*$", md, flags=re.M)
    if h3 != module_names:
        errors.append(f"level-3 headings must be exactly {module_names} in that order, got {h3}")
    if re.search(r"^#{4,} ", md, flags=re.M):
        errors.append("do not use headings deeper than level 3")
    heads = list(re.finditer(r"^#{2,3} (.+?)\s*$", md, flags=re.M))
    for i, h in enumerate(heads):
        if h.group(1) == "Modules":
            continue
        end = heads[i + 1].start() if i + 1 < len(heads) else len(md)
        if len(md[h.end():end].strip()) < MIN_SECTION_CHARS:
            errors.append(f"section '{h.group(1)}' is empty or too short")
    if errors:
        raise ValidationError("; ".join(errors))


def generate_markdown(gen_client, user_prompt, title, module_names):
    messages = [{"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}]
    max_tokens = GEN_MAX_TOKENS_CAP #min(GEN_MAX_TOKENS_CAP, 800 + 350 * len(module_names))
    last_error = None
    for attempt in range(1, MAX_GEN_ATTEMPTS + 1):
        resp = gen_client.chat.completions.create(
            model=GEN_MODEL, messages=messages,
            temperature=GEN_TEMPERATURE, max_tokens=max_tokens,reasoning_effort="low",
        )
        choice = resp.choices[0]
        raw = choice.message.content or ""
        log.info("finish_reason=%s, usage=%s", choice.finish_reason, resp.usage)
        try:
            if choice.finish_reason == "length":
                raise ValidationError("output was cut off at the token limit; be more concise")
            md = normalize(raw, title)
            validate(md, module_names)
            return md
        except ValidationError as e:
            last_error = e
            log.warning("  generation attempt %d/%d failed validation: %s", attempt, MAX_GEN_ATTEMPTS, e)
            messages += [
                {"role": "assistant", "content": raw},
                {"role": "user", "content": f"The page failed validation: {e}. "
                                            "Return the complete corrected page, following the template exactly."},
            ]
    raise last_error


def build_page(docs, embed_client, gen_client, course, topic, subtopic, modules):
    module_chunks, subtopic_chunks = gather_context(docs, embed_client, course, topic, subtopic, modules)
    for m in modules:
        if not module_chunks[m["id"]]:
            log.warning("  no excerpts found for module %r", m[NAME_COL])
    prompt = build_prompt(course, topic, subtopic, modules, module_chunks, subtopic_chunks)
    md = generate_markdown(gen_client, prompt, subtopic[NAME_COL], [m[NAME_COL] for m in modules])
    sources = {
        "modules": {str(mid): [c["id"] for c in cs] for mid, cs in module_chunks.items()},
        "subtopic": [c["id"] for c in subtopic_chunks],
    }
    return md, sources


# --------------------------------------------------------------------------- #
# Job tracking
# --------------------------------------------------------------------------- #
def claim(syl, sid):
    """Atomically flip pending/failed -> running. Returns False if someone else got it."""
    res = (syl.table(JOBS)
           .update({"status": "running", "started_at": now_iso()})
           .eq("subtopic_id", sid).in_("status", ["pending", "failed"]).execute())
    return bool(res.data)


def log_progress(syl):
    rows = fetch_all(syl, JOBS, select="subtopic_id,status", order="subtopic_id")
    c = Counter(r["status"] for r in rows)
    log.info("Progress: %d/%d done | %d pending | %d failed | %d running | %d skipped",
             c["done"], len(rows), c["pending"], c["failed"], c["running"], c["skipped"])


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def parse_args():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--limit", type=int, help="process at most N subtopics this run")
    p.add_argument("--course", help="only subtopics under this course id")
    p.add_argument("--subtopic", help="only this subtopic id")
    p.add_argument("--force", action="store_true", help="regenerate even if already done")
    p.add_argument("--reset-failed", action="store_true", help="reset failed jobs to pending with 0 attempts")
    return p.parse_args()


def main():
    args = parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    syl = create_client(os.environ["SYLLABUS_SUPABASE_URL"], os.environ["SYLLABUS_SUPABASE_KEY"])
    docs = create_client(os.environ["DOCS_SUPABASE_URL"], os.environ["DOCS_SUPABASE_KEY"])

    # Embeddings: NVIDIA NIM
    embed_client = OpenAI(
        base_url=NIM_BASE_URL,
        api_key=os.environ["NVIDIA_API_KEY"],
        max_retries=5,
        timeout=180,
    )

    # Generation: River.ai
    gen_client = OpenAI(
        base_url=RIVER_BASE_URL,
        api_key=os.environ["RIVER_API_KEY"],
        max_retries=5,
        timeout=180,
    )

    # The syllabus is small, so load it once instead of querying per subtopic.
    courses = {r["id"]: r for r in fetch_all(syl, T_COURSES)}
    topics = {r["id"]: r for r in fetch_all(syl, T_TOPICS)}
    subtopics = {r["id"]: r for r in fetch_all(syl, T_SUBTOPICS)}
    modules_by_sub = defaultdict(list)
    for m in fetch_all(syl, T_MODULES):
        modules_by_sub[m[FK_MODULE_SUBTOPIC]].append(m)
    for ms in modules_by_sub.values():
        ms.sort(key=lambda m: (m[MODULE_ORDER_COL], m["id"]))

    targets = [
        sid for sid, s in subtopics.items()
        if (not args.subtopic or str(sid) == args.subtopic)
        and (not args.course
             or str(topics.get(s[FK_SUBTOPIC_TOPIC], {}).get(FK_TOPIC_COURSE)) == args.course)
    ]
    if not targets:
        log.error("No subtopics match the given filters.")
        return
    target_set = set(targets)

    # Seed one job row per subtopic (existing rows are left untouched).
    for batch in chunked(targets, 500):
        syl.table(JOBS).upsert([{"subtopic_id": sid} for sid in batch],
                               on_conflict="subtopic_id", ignore_duplicates=True).execute()

    if args.force:
        for batch in chunked(targets, 200):
            syl.table(JOBS).update({"status": "pending", "attempts": 0, "last_error": None}
                                   ).in_("subtopic_id", batch).execute()
    if args.reset_failed:
        syl.table(JOBS).update({"status": "pending", "attempts": 0}).eq("status", "failed").execute()

    # Recover jobs that were 'running' when a previous run died.
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=STALE_MINUTES)).isoformat()
    syl.table(JOBS).update({"status": "pending"}).eq("status", "running").lt("updated_at", cutoff).execute()

    log_progress(syl)
    queue = fetch_all(
        syl, JOBS, order="subtopic_id",
        apply=lambda q: q.or_(f"status.eq.pending,and(status.eq.failed,attempts.lt.{MAX_JOB_ATTEMPTS})"),
    )
    queue = [j for j in queue if j["subtopic_id"] in target_set]
    if args.limit:
        queue = queue[:args.limit]
    log.info("%d subtopic(s) queued this run", len(queue))

    ok = bad = 0
    for n, job in enumerate(queue, 1):
        sid = job["subtopic_id"]
        if not claim(syl, sid):
            continue
        sub = subtopics[sid]
        name = sub[NAME_COL].strip()
        modules = [dict(m, **{NAME_COL: m[NAME_COL].strip()}) for m in modules_by_sub.get(sid, [])]
        log.info("[%d/%d] %s (id=%s, %d modules)", n, len(queue), name, sid, len(modules))

        try:
            if not modules:
                syl.table(JOBS).update({"status": "skipped", "last_error": "subtopic has no modules",
                                        "finished_at": now_iso()}).eq("subtopic_id", sid).execute()
                log.warning("  skipped: no modules")
                continue

            topic = topics[sub[FK_SUBTOPIC_TOPIC]]
            course = courses[topic[FK_TOPIC_COURSE]]
            sub = dict(sub, **{NAME_COL: name})
            md, sources = build_page(docs, embed_client, gen_client, course, topic, sub, modules)

            # `status` is omitted on purpose: new rows default to 'draft', existing rows keep theirs.
            syl.table(PAGES).upsert({
                "subtopic_id": sid,
                "slug": make_slug(name, sid),
                "title": name,
                "markdown": md,
                "model": GEN_MODEL,
                "prompt_version": PROMPT_VERSION,
                "sources": sources,
                "generated_at": now_iso(),
            }, on_conflict="subtopic_id").execute()
            syl.table(JOBS).update({"status": "done", "last_error": None,
                                    "finished_at": now_iso()}).eq("subtopic_id", sid).execute()
            ok += 1
        except KeyboardInterrupt:
            syl.table(JOBS).update({"status": "pending"}).eq("subtopic_id", sid).execute()
            log.warning("Interrupted. Job released; re-run to resume.")
            sys.exit(130)
        except Exception as e:  # noqa: BLE001 - record and move on to the next subtopic
            log.error("  failed: %s", e)
            syl.table(JOBS).update({"status": "failed", "attempts": job["attempts"] + 1,
                                    "last_error": str(e)[:1000],
                                    "finished_at": now_iso()}).eq("subtopic_id", sid).execute()
            bad += 1

        time.sleep(DELAY_SECONDS)

    log.info("Run complete: %d generated, %d failed", ok, bad)
    log_progress(syl)


if __name__ == "__main__":
    main()