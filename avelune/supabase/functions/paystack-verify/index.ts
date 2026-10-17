import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, reason: "method" }, 405);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY") ?? "";
  
  if (!url || !service || !paystackSecret) {
    return json({ ok: false, reason: "server_misconfigured" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ ok: false, reason: "unauthenticated" }, 401);

  const admin = createClient(url, service);
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json({ ok: false, reason: "unauthenticated" }, 401);

  let body: { reference?: string; tier?: string };
  try { body = await req.json(); } catch { return json({ ok: false, reason: "bad_body" }, 400); }
  
  const { reference, tier } = body;
  if (!reference || !tier) return json({ ok: false, reason: "missing_fields" }, 400);

  const pRes = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
    headers: { Authorization: `Bearer ${paystackSecret}` },
  });
  const pData = await pRes.json();

  if (!pData.status || pData.data.status !== "success") {
    return json({ ok: false, reason: "payment_failed", detail: pData.data?.gateway_response }, 400);
  }

  const expectedAmount = tier === "pro" ? 150000 : tier === "platinum" ? 350000 : 500000;
  if (pData.data.amount < expectedAmount) {
    return json({ ok: false, reason: "amount_mismatch" }, 400);
  }

  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 1);

  await admin.from("profiles").update({
    tier: tier,
    tier_expires_at: expiresAt.toISOString(),
  }).eq("id", userData.user.id);

  await admin.from("payments").insert({
    user_id: userData.user.id,
    reference: reference,
    amount: pData.data.amount / 100,
    tier: tier,
    status: "success",
  });

  return json({ ok: true, tier });
});
