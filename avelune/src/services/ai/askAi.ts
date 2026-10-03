import { supabase } from '@/lib/supabase';

export type AskAIContext =
  | "study"
  | "quiz_review"
  | "sep_review";

export interface AskAIRequest {
  question_id: number;
  context: AskAIContext;
  message: string;
}

export interface AskAIResponse {
  ok: boolean;
  answer_markdown?: string;
  reason?: string;
}

export async function askAI(
  request: AskAIRequest,
): Promise<AskAIResponse> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new Error("no session on this page; sign in again");
  }
  const { data, error } = await supabase.functions.invoke("ask-ai", {
    body: request,
    headers: { Authorization: "Bearer " + token },
  });

  if (error) {
    let detail = error.message || "Unable to contact Ask AI.";
    try {
      const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
      if (ctx && typeof ctx.json === "function") {
        detail = JSON.stringify(await ctx.json());
      }
    } catch {
      /* keep error.message */
    }
    console.warn("[ASK AI]", detail);
    throw new Error(detail);
  }

  if (!data || typeof data !== "object") {
    throw new Error("Ask AI returned an invalid response.");
  }

  return data as AskAIResponse;
}
