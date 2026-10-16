import { createClient } from "npm:@supabase/supabase-js@2";

// River.ai (OpenAI-compatible) — generation via DeepSeek.
const RIVER_BASE_URL = Deno.env.get("RIVER_BASE_URL") ?? "https://api.river.ai/v1";
const DEFAULT_MAX_TOKENS = 1200;
const configuredMaxTokens = Number(Deno.env.get("RIVER_MAX_TOKENS"));
const MAX_TOKENS = Number.isFinite(configuredMaxTokens) &&
    configuredMaxTokens >= 700
  ? Math.floor(configuredMaxTokens)
  : DEFAULT_MAX_TOKENS;
// Longer generations need more than the previous 25 second budget.
const TIMEOUT_MS = 45_000;
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
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

function parseHistory(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is ChatMessage =>
      isRecord(item) &&
      (item.role === "user" || item.role === "assistant") &&
      typeof item.content === "string",
    )
    .slice(-8)
    .map((item) => ({
      role: item.role,
      content: item.content.trim().slice(0, 1000),
    }))
    .filter((item) => item.content.length > 0);
}

/**
 * DeepSeek is a reasoning model: it can emit hidden reasoning blocks or wrap its
 * reply in a code fence. Strip both so the UI only ever shows the answer.
 */
function cleanAnswer(raw: string): string {
  let text = raw
    .replace(/[\s\S]*?<\/redacted_REASONING>/gi, "")
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "")
    .trim();
  const fenced = text.match(/^```[A-Za-z]*\n([\s\S]*)\n```$/);
  if (fenced) text = fenced[1];
  return text.trim();
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
  const systemPrompt = Deno.env.get("RIVER_SYSTEM_PROMPT")?.trim() ?? "";
  const model = Deno.env.get("RIVER_MODEL")?.trim() ||
    "deepseek-ai/DeepSeek-V4.1-Flash";
  // Comma-separated, so a key can be rotated without redeploying.
  const keys = (Deno.env.get("RIVER_API_KEYS") ??
    Deno.env.get("RIVER_API_KEY") ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
  // Low reasoning effort keeps tutor replies fast; set high for harder topics.
  const reasoningEffort = Deno.env.get("RIVER_REASONING_EFFORT")?.trim() || "low";
  if (!url || !anon || !service || !systemPrompt || !model || keys.length === 0) {
    return json({ ok: false, reason: "server_misconfigured" }, 500);
  }

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
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

  const questionId = Number(body.question_id);
  const context = body.context;
  const message =
    typeof body.message === "string" ? body.message.trim().slice(0, 500) : "";
  const quizId = Number(body.quiz_id);
  const syllabusId = Number(body.syllabus_id);
  if (
    !Number.isSafeInteger(questionId) ||
    questionId <= 0 ||
    !message ||
    (context !== "study" && context !== "quiz_review") ||
    (context === "study" &&
      (!Number.isSafeInteger(syllabusId) || syllabusId <= 0))
  ) {
    return json({ ok: false, reason: "bad_body" }, 400);
  }

  const admin = createClient(url, service);
  if (context === "quiz_review") {
    if (!Number.isSafeInteger(quizId) || quizId <= 0) {
      return json({ ok: false, reason: "quiz_required" }, 400);
    }
    const { data: quiz, error: quizError } = await admin
      .from("quizzes")
      .select("question_ids")
      .eq("id", quizId)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (quizError) {
      console.error("[ASK AI] Quiz ownership check failed.", quizError);
      return json({ ok: false, reason: "question_unavailable" }, 500);
    }
    if (
      !quiz ||
      !Array.isArray(quiz.question_ids) ||
      !quiz.question_ids.some((id: unknown) => Number(id) === questionId)
    ) {
      return json({ ok: false, reason: "question_unavailable" }, 404);
    }
  }

  const { data: question, error: questionError } = await admin
    .from("questions")
    .select("module_id, question_type, question_data, premium_explanation")
    .eq("id", questionId)
    .maybeSingle();
  if (questionError) {
    console.error("[ASK AI] Question load failed.", questionError);
    return json({ ok: false, reason: "question_unavailable" }, 500);
  }
  if (!question || !isRecord(question.question_data)) {
    return json({ ok: false, reason: "question_unavailable" }, 404);
  }

  if (context === "study") {
    const { data: moduleRow, error: moduleError } = await admin
      .from("syllabus")
      .select("id")
      .eq("id", syllabusId)
      .eq("module_id", question.module_id)
      .maybeSingle();
    if (moduleError || !moduleRow) {
      if (moduleError) console.error("[ASK AI] Module ownership check failed.", moduleError);
      return json({ ok: false, reason: "question_unavailable" }, 404);
    }
  }

  const { data: entitlementData, error: entitlementError } =
    await userClient.rpc("get_my_plan_summary");
  if (entitlementError || !isRecord(entitlementData)) {
    console.error("[ASK AI] Plan lookup failed.", entitlementError);
    return json({ ok: false, reason: "plan_unavailable" }, 500);
  }
  const isPremium = entitlementData.premium_explanations === true;
  const questionData = question.question_data;
  const questionText = String(
    question.question_type === "tf"
      ? questionData.statement ?? ""
      : questionData.question ?? "",
  ).trim();
  const answerText = String(questionData.answer ?? "").trim();
  const explanation = String(
    isPremium
      ? question.premium_explanation || questionData.explanation || ""
      : questionData.explanation || "",
  ).trim();
  const options = question.question_type === "tf"
    ? ["T: True", "F: False"]
    : Array.isArray(questionData.options)
    ? questionData.options.slice(0, 4).map((option, index) =>
      `${String.fromCharCode(65 + index)}: ${String(option)}`,
    )
    : [];
  if (!questionText || !answerText) {
    return json({ ok: false, reason: "question_invalid" }, 422);
  }

  const { data: reservation, error: reservationError } = await admin.rpc(
    "reserve_ai_usage",
    { p_user_id: userData.user.id },
  );
  if (reservationError || !isRecord(reservation)) {
    console.error("[ASK AI] Could not reserve AI usage.", reservationError);
    return json({ ok: false, reason: "usage_unavailable" }, 500);
  }
  if (reservation.allowed !== true) {
    return json({
      ok: false,
      reason: "daily_limit",
      used: reservation.used,
      limit: reservation.limit,
      tier: reservation.tier,
    }, 429);
  }

  const history = parseHistory(body.history);
  const messages = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: [
        `Question: ${questionText}`,
        ...options,
        `Keyed answer: ${answerText}`,
        `Official explanation: ${explanation}`,
      ].join("\n"),
    },
    ...history,
    { role: "user", content: message },
  ];

  let lastStatus: number | null = null;
  let lastReason = "provider_failed";
  for (const key of keys) {
    try {
      const response = await fetch(`${RIVER_BASE_URL.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: MAX_TOKENS,
          stream: false,
          reasoning_effort: reasoningEffort,
          messages,
        }),
      });
      lastStatus = response.status;
      if (!response.ok) {
        lastReason = "provider_failed";
        console.warn(`[ASK AI] River.ai key attempt failed with HTTP ${response.status}.`);
        continue;
      }

      const responseBody: unknown = await response.json();
      const firstChoice = isRecord(responseBody) &&
        Array.isArray(responseBody.choices) &&
        isRecord(responseBody.choices[0])
        ? responseBody.choices[0]
        : null;
      const rawAnswer = isRecord(firstChoice) && isRecord(firstChoice.message)
        ? firstChoice.message.content
        : null;
      if (typeof rawAnswer !== "string" || !rawAnswer.trim()) {
        lastReason = "provider_empty";
        continue;
      }
      if (firstChoice && firstChoice.finish_reason === "length") {
        console.warn(
          `[ASK AI] Provider stopped at the token limit (${MAX_TOKENS}); the answer may be cut short.`,
        );
      }
      return json({
        ok: true,
        answer_markdown: cleanAnswer(rawAnswer),
        used: reservation.used,
        limit: reservation.limit,
      });
    } catch (error) {
      console.warn("[ASK AI] River.ai request failed; trying next key.", error);
      lastReason = "provider_failed";
    }
  }

  const { error: refundError } = await admin.rpc("refund_ai_usage", {
    p_user_id: userData.user.id,
  });
  if (refundError) {
    console.error("[ASK AI] Could not refund failed AI request.", refundError);
  }
  return json({
    ok: false,
    reason: lastReason,
    provider_status: lastStatus,
  }, 502);
});
