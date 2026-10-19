import { createClient } from "npm:@supabase/supabase-js@2";

// Generates a personalized multiple-choice / true-false quiz from a study
// note (`public.pages`) and its curriculum modules (`public.syllabus`).
//
// River.ai (OpenAI-compatible) — generation via DeepSeek.
const RIVER_BASE_URL = Deno.env.get("RIVER_BASE_URL") ?? "https://api.river.ai/v1";
const DEFAULT_MODEL = "deepseek-ai/DeepSeek-V4.1-Flash";
const TIMEOUT_MS = 110_000;
const MAX_QUESTIONS = 25;
const NOTE_BUDGET = 9_000;
const MODULE_BUDGET = 9_000;
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type QuestionType = "mcq" | "tf" | "mcq_tf";
type GeneratedQuestion = {
  id: number;
  type: "mcq" | "tf";
  question: string;
  options: string[];
  answer: string;
  explanation: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function truncate(value: string, limit: number): string {
  const text = value.trim();
  return text.length > limit ? `${text.slice(0, limit)}\n[truncated]` : text;
}

/** DeepSeek can wrap JSON in a fence or emit hidden reasoning blocks. */
function extractJson(raw: string): unknown {
  let text = raw
    .replace(/[\s\S]*?<\/redacted_REASONING>/gi, "")
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "")
    .trim();

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();

  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    text = text.slice(objectStart, objectEnd + 1);
  } else {
    const arrayStart = text.indexOf("[");
    const arrayEnd = text.lastIndexOf("]");
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      text = text.slice(arrayStart, arrayEnd + 1);
    }
  }

  return JSON.parse(text);
}

function normalizeQuestion(
  value: unknown,
  allowed: QuestionType,
): GeneratedQuestion | null {
  if (!isRecord(value)) return null;

  const rawType = String(value.type ?? "").trim().toLowerCase();
  const kind: "mcq" | "tf" =
    rawType === "tf" || rawType === "truefalse" || rawType === "true_false"
      ? "tf"
      : "mcq";
  if (allowed === "mcq" && kind === "tf") return null;
  if (allowed === "tf" && kind === "mcq") return null;

  const explanation = String(value.explanation ?? "").trim().slice(0, 800);

  if (kind === "tf") {
    const statement = String(value.question ?? value.statement ?? "").trim();
    const rawAnswer = String(value.answer ?? "").trim().toUpperCase();
    const answer = rawAnswer === "T" || rawAnswer === "TRUE"
      ? "T"
      : rawAnswer === "F" || rawAnswer === "FALSE"
      ? "F"
      : "";
    if (!statement || !answer) return null;
    return {
      id: 0,
      type: "tf",
      question: statement.slice(0, 500),
      options: ["T", "F"],
      answer,
      explanation,
    };
  }

  const question = String(value.question ?? "").trim();
  const options = Array.isArray(value.options)
    ? value.options.map((option) => String(option).trim()).filter(Boolean)
    : [];
  if (!question || options.length !== 4) return null;

  const rawAnswer = String(value.answer ?? "").trim();
  let answer = "";
  if (/^[A-Da-d]$/.test(rawAnswer)) {
    answer = rawAnswer.toUpperCase();
  } else if (/^[0-3]$/.test(rawAnswer)) {
    answer = "ABCD"[Number(rawAnswer)];
  } else {
    const index = options.findIndex((option) =>
      option.toLowerCase() === rawAnswer.toLowerCase()
    );
    if (index >= 0) answer = "ABCD"[index];
  }
  if (!answer) return null;

  return {
    id: 0,
    type: "mcq",
    question: question.slice(0, 500),
    options: options.map((option) => option.slice(0, 300)),
    answer,
    explanation,
  };
}

function parseQuestions(
  raw: string,
  count: number,
  allowed: QuestionType,
): GeneratedQuestion[] {
  let parsed: unknown;
  try {
    parsed = extractJson(raw);
  } catch {
    return [];
  }

  const list = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.questions)
    ? parsed.questions
    : [];

  const questions: GeneratedQuestion[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const question = normalizeQuestion(item, allowed);
    if (!question) continue;
    const key = question.question.toLowerCase().replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    questions.push(question);
    if (questions.length >= count) break;
  }

  return questions.map((question, index) => ({ ...question, id: index + 1 }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ ok: false, reason: "method" }, 405);
  }

  const header = req.headers.get("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ ok: false, reason: "unauthenticated" }, 401);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const model = Deno.env.get("RIVER_MODEL")?.trim() || DEFAULT_MODEL;
  const keys = (Deno.env.get("RIVER_API_KEYS") ??
    Deno.env.get("RIVER_API_KEY") ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
  // Generation is a structured task; low effort keeps latency predictable.
  const reasoningEffort = Deno.env.get("RIVER_REASONING_EFFORT")?.trim() || "low";
  if (!url || !anon || !service || !model || keys.length === 0) {
    return json({ ok: false, reason: "server_misconfigured" }, 500);
  }

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } =
    await userClient.auth.getUser(token);
  if (userError || !userData.user) {
    return json({ ok: false, reason: "unauthenticated" }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, reason: "bad_body" }, 400);
  }
  if (!isRecord(body)) return json({ ok: false, reason: "bad_body" }, 400);

  const subtopicId = Number(body.subtopic_id);
  const count = Number(body.count);
  const rawType = String(body.question_type ?? "mcq");
  const questionType: QuestionType = rawType === "tf"
    ? "tf"
    : rawType === "mcq_tf"
    ? "mcq_tf"
    : "mcq";
  if (
    !Number.isSafeInteger(subtopicId) || subtopicId <= 0 ||
    !Number.isSafeInteger(count) || count < 1 || count > MAX_QUESTIONS ||
    !["mcq", "tf", "mcq_tf"].includes(rawType)
  ) {
    return json({ ok: false, reason: "bad_body" }, 400);
  }

  const admin = createClient(url, service);

  const { data: modules, error: moduleError } = await admin
    .from("syllabus")
    .select(
      "course_name, topic_name, subtopic_name, module_name, content, objectives",
    )
    .eq("subtopic_id", subtopicId)
    .order("id", { ascending: true });

  if (moduleError) {
    console.error("[GENERATE QUIZ] Could not load curriculum.", moduleError);
    return json({ ok: false, reason: "source_unavailable" }, 500);
  }
  if (!Array.isArray(modules) || modules.length === 0) {
    return json({ ok: false, reason: "subtopic_unavailable" }, 404);
  }

  const { data: note, error: noteError } = await admin
    .from("pages")
    .select("slug, title, markdown")
    .eq("subtopic_id", subtopicId)
    .eq("status", "published")
    .maybeSingle();

  if (noteError) {
    console.error("[GENERATE QUIZ] Could not load study note.", noteError);
  }

  const noteText = truncate(String(note?.markdown ?? ""), NOTE_BUDGET);
  const moduleText = truncate(
    modules
      .map((module) =>
        [
          module.module_name ? `Module: ${module.module_name}` : "",
          module.objectives ? `Objectives:\n${module.objectives}` : "",
          module.content ? `Content:\n${module.content}` : "",
        ].filter(Boolean).join("\n")
      )
      .join("\n\n"),
    MODULE_BUDGET,
  );

  const source = [
    noteText
      ? `STUDY NOTE${note?.title ? ` — ${note.title}` : ""}:\n${noteText}`
      : "",
    moduleText ? `CURRICULUM MODULES:\n${moduleText}` : "",
  ].filter(Boolean).join("\n\n");

  if (source.trim().length < 200) {
    return json({ ok: false, reason: "insufficient_source" }, 422);
  }

  const { data: reservation, error: reservationError } = await admin.rpc(
    "reserve_generated_question_usage",
    { p_user_id: userData.user.id, p_count: count },
  );
  if (reservationError || !isRecord(reservation)) {
    console.error("[GENERATE QUIZ] Could not reserve usage.", reservationError);
    return json({ ok: false, reason: "usage_unavailable" }, 500);
  }
  if (reservation.allowed !== true) {
    return json({
      ok: false,
      reason: String(reservation.reason ?? "daily_limit"),
      used: reservation.used,
      limit: reservation.limit,
      tier: reservation.tier,
    }, 429);
  }

  const granted = Number(reservation.granted);
  if (!Number.isSafeInteger(granted) || granted < 1) {
    return json({ ok: false, reason: "usage_unavailable" }, 500);
  }
  const usedAfterGrant = Number(reservation.used) || granted;
  const limit = Number(reservation.limit) || 0;
  let refunded = 0;

  const refund = async (amount: number) => {
    if (amount <= 0) return;
    refunded += amount;
    const { error } = await admin.rpc("refund_generated_question_usage", {
      p_user_id: userData.user.id,
      p_count: amount,
    });
    if (error) console.error("[GENERATE QUIZ] Could not refund usage.", error);
  };

  const first = modules[0];
  const questionLabel = questionType === "tf"
    ? "true/false"
    : questionType === "mcq_tf"
    ? "multiple-choice or true/false"
    : "multiple-choice";

  const prompt = [
    `Write exactly ${granted} ${questionLabel} questions for a Nigerian medical student.`,
    "",
    `Course: ${first.course_name}`,
    `Topic: ${first.topic_name}`,
    `Subtopic: ${first.subtopic_name}`,
    "",
    "Ground every question in the source material below. Test understanding,",
    "mechanisms and clinical application rather than isolated trivia. Do not",
    "repeat a question, and never use \"all of the above\" or \"none of the above\".",
    "",
    "Return ONLY valid JSON in this shape:",
    '{"questions":[{"type":"mcq","question":"...","options":["...","...","...","..."],"answer":"A","explanation":"..."},{"type":"tf","question":"...","answer":"T","explanation":"..."}]}',
    "",
    "Rules:",
    "- MCQ: exactly 4 options and one unambiguous answer (A, B, C or D).",
    "- True/false: answer must be \"T\" or \"F\"; no options array is needed.",
    "- explanation: 1-2 sentences saying why the answer is right.",
    "- Use plain text only: no markdown, numbering or code fences.",
    "",
    "SOURCE MATERIAL:",
    source,
  ].join("\n");

  const messages = [
    {
      role: "system",
      content:
        "You are an experienced medical school examiner. You output only valid JSON.",
    },
    { role: "user", content: prompt },
  ];

  const maxTokens = Math.min(8_000, 700 + granted * 380);
  let lastStatus: number | null = null;
  let lastReason = "provider_failed";

  for (const key of keys) {
    try {
      const response = await fetch(
        `${RIVER_BASE_URL.replace(/\/+$/, "")}/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(TIMEOUT_MS),
          body: JSON.stringify({
            model,
            temperature: 0.4,
            max_tokens: maxTokens,
            stream: false,
            reasoning_effort: reasoningEffort,
            messages,
          }),
        },
      );
      lastStatus = response.status;
      if (!response.ok) {
        lastReason = "provider_failed";
        console.warn(
          `[GENERATE QUIZ] River.ai key attempt failed with HTTP ${response.status}.`,
        );
        continue;
      }

      const responseBody: unknown = await response.json();
      const firstChoice =
        isRecord(responseBody) &&
          Array.isArray(responseBody.choices) &&
          isRecord(responseBody.choices[0])
          ? responseBody.choices[0]
          : null;
      const raw = isRecord(firstChoice) && isRecord(firstChoice.message)
        ? firstChoice.message.content
        : null;
      if (typeof raw !== "string" || !raw.trim()) {
        lastReason = "provider_empty";
        continue;
      }

      const questions = parseQuestions(raw, granted, questionType);
      if (questions.length === 0) {
        lastReason = "provider_invalid";
        continue;
      }

      if (questions.length < granted) {
        await refund(granted - questions.length);
      }

      const { data: inserted, error: insertError } = await admin
        .from("generated_quizzes")
        .insert({
          user_id: userData.user.id,
          subtopic_id: subtopicId,
          note_slug: note?.slug ?? null,
          note_title: note?.title ?? first.subtopic_name,
          course_name: first.course_name ?? "",
          topic_name: first.topic_name ?? "",
          subtopic_name: first.subtopic_name ?? "",
          question_type: questionType,
          total_questions: questions.length,
          questions,
        })
        .select("id")
        .single();

      if (insertError || !inserted) {
        console.error("[GENERATE QUIZ] Could not save quiz.", insertError);
        await refund(questions.length);
        return json({ ok: false, reason: "save_failed" }, 500);
      }

      return json({
        ok: true,
        quiz_id: inserted.id,
        granted: questions.length,
        used: Math.max(0, usedAfterGrant - refunded),
        limit,
      });
    } catch (error) {
      console.warn(
        "[GENERATE QUIZ] River.ai request failed; trying next key.",
        error,
      );
      lastReason = "provider_failed";
    }
  }

  await refund(granted);

  return json({
    ok: false,
    reason: lastReason,
    provider_status: lastStatus,
  }, 502);
});



