ploy chec
import { createCabase-js@2"
const NVIDIA_API_URL = icv/a/mlis;osTT_inmr--s
  return new Response(JSON.stri, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
Deno.serve(async (req) => {
  console.log("[MARKER-4d340d] handler reached");
  if (req.method !== "POST") return json({

  const header = req.headers.get("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  console.log("[ask-ai] header len:", header.length, "token len:", token.length, "prefix:", header.slice(0, 12)); if (!token) {
    return json({ ok: false, reason: "unauthenticated", where: "no-token", headerLen: header.length }, 401);
  }

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const nvidia = Deno.env.get("NVIDIA_API_KEY") ?? "";
  if (!url || !anon || !service || !nvidia) {
    return json({ ok: false, reason: "server_misconfigured" }, 500);
  }

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: "Bearer " + token } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user) {
    console.log("[ask-ai] getUser failed:", userError?.message ?? "no user");
    return json({
      ok: false,
      reason: "unauthenticated",
      where: "getUser",
      detail: userError?.message ?? "no user returned",
    }, 401);
  }

  let body: { question_id?: number; message?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, reason: "bad_body" }, 400);
  }
  const questionId = Number(body.question_id);
  const message = String(body.message ?? "").trim().slice(0, 500);
  if (!questionId || !message) return json({ ok: false, reason: "bad_body" }, 400);

  const admin = createClient(url, service);
  const { data: question, error: questionError } = await admin
    .from("question_bank")
    .select("id, question, option_a, option_b, option_c, option_d, correct_answer, standard_explanation")
    .eq("id", questionId)
    .maybeSingle();
  if (questionError || !question) return json({ ok: false, reason: "question_not_found" }, 404);

  const nvidiaRes = await fetch(NVIDIA_API_URL, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + nvidia,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: TUTOR_MODEL,
      temperature: 0.2,
      max_tokens: 700,
      stream: false,
      messages: [
        {
          role: "system",
          content: "You are a JAMB tutor. Answer only about this question. Use the keyed answer. Be short. Markdown only. Do not invent a new question.",
        },
        {
          role: "user",
          content: [
            "Question: " + question.question,
            "A: " + question.option_a,
            "B: " + question.option_b,
            "C: " + question.option_c,
            "D: " + question.option_d,
            "Keyed answer: " + question.correct_answer,
            "Official explanation: " + (question.standard_explanation ?? ""),
            "Student: " + message,
          ].join("\n"),
        },
      ],
    }),
  });
  const nvidiaBody = await nvidiaRes.json().catch(() => null);
  if (!nvidiaRes.ok) {
    return json({ ok: false, reason: "tutor_failed", detail: nvidiaRes.status }, 502);
  }
  const answer = nvidiaBody?.choices?.[0]?.message?.content;
  if (typeof answer !== "string" || !answer.trim()) {
    return json({ ok: false, reason: "tutor_empty" }, 502);
  }
  return json({ ok: true, answer_markdown: answer.trim() });
});
