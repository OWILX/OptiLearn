# Ask AI Edge Function

Deploy with JWT verification enabled. Configure these Supabase Function secrets
before deploying:

| Secret | Required | Purpose |
| --- | --- | --- |
| `RIVER_API_KEY` | Yes | River.ai API key. |
| `RIVER_API_KEYS` | No | Comma-separated keys; tried in order when one fails, so a key can be rotated without redeploying. Takes precedence over `RIVER_API_KEY`. |
| `RIVER_SYSTEM_PROMPT` | Yes | System instructions used for every question discussion. |
| `RIVER_MODEL` | No | Defaults to `deepseek-ai/DeepSeek-V4.1-Flash`. |
| `RIVER_BASE_URL` | No | Defaults to `https://api.river.ai/v1`. |
| `RIVER_REASONING_EFFORT` | No | `low` (default), `medium`, or `high`. |
| `RIVER_MAX_TOKENS` | No | Defaults to 1200; answers were cut off mid-sentence at 700. |

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` to deployed Edge Functions. Never put River keys or
the service-role key in frontend code.

```sh
supabase secrets set RIVER_API_KEY="your-key" RIVER_SYSTEM_PROMPT="your system prompt"
supabase functions deploy ask-ai
```

The function authenticates the caller, checks quiz ownership for quiz reviews,
loads the question itself, reserves one daily AI message, and refunds the
reservation if all configured keys fail. The response includes a
machine-readable `reason`; `daily_limit` is returned with HTTP 429.

If the function logs `Could not find the table 'public.table_name' in the
schema cache`, confirm that the deployed function is the current source in
this directory: it queries `quizzes`, `questions`, and `syllabus`, and does not
reference a relation named `table_name`. Also apply the project's pending
database migrations and redeploy `ask-ai`. If the message names one of the
real tables instead, verify that table exists in the `public` schema and that
the latest schema cache has loaded.
