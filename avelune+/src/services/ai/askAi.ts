import { supabase } from '@/lib/supabase';
import { UserFacingError } from '@/utils/errors';

export type AskAIContext =
  | "study"
  | "quiz_review";

export interface AskAIRequest {
  question_id: number;
  context: AskAIContext;
  syllabus_id?: number;
  quiz_id?: number;
  message: string;
  history?: AskAIMessage[];
}

export interface AskAIMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AskAIResponse {
  ok: boolean;
  answer_markdown?: string;
  reason?: string;
  used?: number;
  limit?: number;
  tier?: string;
}

export function getAskAIErrorMessage(response: AskAIResponse): string {
  switch (response.reason) {
    case 'daily_limit':
      return `You have used all ${response.limit ?? 'included'} AI messages for today.`;
    case 'server_misconfigured':
      return 'The AI service is not configured yet. Please try again later.';
    case 'question_unavailable':
      return 'This question is not available for AI discussion.';
    case 'plan_unavailable':
    case 'usage_unavailable':
      return 'We could not verify your AI allowance. Please try again.';
    case 'provider_failed':
    case 'provider_empty':
      return 'The AI service could not respond right now. Please try again.';
    default:
      return 'Could not get an answer. Please try again.';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function askAI(
  request: AskAIRequest,
): Promise<AskAIResponse> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new UserFacingError('Please sign in again to use Ask AI.');
  }
  const { data, error } = await supabase.functions.invoke("ask-ai", {
    body: request,
    headers: { Authorization: "Bearer " + token },
  });

  if (error) {
    let response: unknown;
    try {
      const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
      if (ctx && typeof ctx.json === "function") {
        response = await ctx.json();
        if (isRecord(response) && response.ok === false) {
          return {
            ok: false,
            reason: typeof response.reason === 'string'
              ? response.reason
              : 'request_failed',
            used: typeof response.used === 'number' ? response.used : undefined,
            limit: typeof response.limit === 'number' ? response.limit : undefined,
            tier: typeof response.tier === 'string' ? response.tier : undefined,
          };
        }
      }
    } catch (parseError) {
      console.error('[ASK AI] Could not parse the error response:', parseError);
    }
    console.error('[ASK AI] Request failed:', error, response);
    throw new UserFacingError('The AI service could not respond right now. Please try again.');
  }

  if (!isRecord(data) || typeof data.ok !== 'boolean') {
    console.error('[ASK AI] Invalid response:', data);
    throw new UserFacingError('The AI service returned an unexpected response. Please try again.');
  }

  return {
    ok: data.ok,
    answer_markdown: typeof data.answer_markdown === 'string'
      ? data.answer_markdown
      : undefined,
    reason: typeof data.reason === 'string' ? data.reason : undefined,
    used: typeof data.used === 'number' ? data.used : undefined,
    limit: typeof data.limit === 'number' ? data.limit : undefined,
    tier: typeof data.tier === 'string' ? data.tier : undefined,
  };
}
