import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ ok: false, reason: "method" }, 405);
  }

  const token = (req.headers.get("Authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) return json({ ok: false, reason: "unauthenticated" }, 401);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY") ?? "";
  const paystackMode = Deno.env.get("PAYSTACK_MODE") ?? "";
  const appUrl = Deno.env.get("APP_URL") ?? "";
  if (
    !url ||
    !anon ||
    !service ||
    !paystackSecret ||
    (paystackMode !== "test" && paystackMode !== "live") ||
    !appUrl
  ) {
    console.error("[PAYSTACK CHECKOUT] Required server configuration is missing.");
    return json({ ok: false, reason: "server_misconfigured" }, 500);
  }
  const expectedKeyPrefix = paystackMode === "test" ? "sk_test_" : "sk_live_";
  if (!paystackSecret.startsWith(expectedKeyPrefix)) {
    console.error("[PAYSTACK CHECKOUT] Secret key does not match PAYSTACK_MODE.");
    return json({ ok: false, reason: "server_misconfigured" }, 500);
  }

  let callbackUrl: string;
  try {
    const app = new URL(appUrl);
    const localHttp = app.protocol === "http:" &&
      (app.hostname === "localhost" || app.hostname === "127.0.0.1");
    if (app.protocol !== "https:" && !localHttp) {
      return json({ ok: false, reason: "server_misconfigured" }, 500);
    }
    callbackUrl = new URL("/plans?payment=success", app).toString();
  } catch {
    return json({ ok: false, reason: "server_misconfigured" }, 500);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, reason: "bad_body" }, 400);
  }
  if (!isRecord(body) || (body.tier !== "plus" && body.tier !== "pro")) {
    return json({ ok: false, reason: "bad_body" }, 400);
  }

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user?.email) {
    return json({ ok: false, reason: "unauthenticated" }, 401);
  }

  const admin = createClient(url, service);
  const { data: currentSubscription, error: subscriptionError } = await admin
    .from("user_subscriptions")
    .select("status, current_period_end")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (subscriptionError) {
    console.error("[PAYSTACK CHECKOUT] Existing subscription lookup failed.", subscriptionError);
    return json({ ok: false, reason: "subscription_unavailable" }, 500);
  }
  if (
    currentSubscription?.status === "active" &&
    (!currentSubscription.current_period_end ||
      new Date(currentSubscription.current_period_end).getTime() > Date.now())
  ) {
    return json({ ok: false, reason: "already_subscribed" }, 409);
  }

  const { data: plan, error: planError } = await admin
    .from("plan_catalog")
    .select(
      "tier_key, monthly_price_ngn, paystack_test_plan_code, paystack_live_plan_code",
    )
    .eq("tier_key", body.tier)
    .maybeSingle();
  if (planError) {
    console.error("[PAYSTACK CHECKOUT] Plan load failed.", planError);
    return json({ ok: false, reason: "plan_unavailable" }, 500);
  }
  const configuredPlanCode = plan
    ? paystackMode === "test"
      ? plan.paystack_test_plan_code
      : plan.paystack_live_plan_code
    : null;
  if (
    !plan ||
    typeof plan.monthly_price_ngn !== "number" ||
    !Number.isSafeInteger(plan.monthly_price_ngn) ||
    plan.monthly_price_ngn <= 0 ||
    typeof configuredPlanCode !== "string" ||
    !configuredPlanCode.trim()
  ) {
    return json({ ok: false, reason: "plan_unavailable" }, 503);
  }
  const planCode = configuredPlanCode;

  const expectedAmount = plan.monthly_price_ngn * 100;
  if (!Number.isSafeInteger(expectedAmount)) {
    return json({ ok: false, reason: "plan_unavailable" }, 503);
  }

  let paystackPlanResponse: Response;
  try {
    paystackPlanResponse = await fetch(
      `https://api.paystack.co/plan/${encodeURIComponent(planCode)}`,
      {
        headers: { Authorization: `Bearer ${paystackSecret}` },
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch (error) {
    console.error("[PAYSTACK CHECKOUT] Plan verification request failed.", error);
    return json({ ok: false, reason: "provider_unavailable" }, 502);
  }

  let paystackPlanBody: unknown;
  try {
    paystackPlanBody = await paystackPlanResponse.json();
  } catch (error) {
    console.error("[PAYSTACK CHECKOUT] Plan verification response was invalid.", error);
    return json({ ok: false, reason: "provider_unavailable" }, 502);
  }
  const paystackPlanData = isRecord(paystackPlanBody)
    ? paystackPlanBody.data
    : null;
  const providerMessage =
    isRecord(paystackPlanBody) && typeof paystackPlanBody.message === "string"
      ? paystackPlanBody.message.replace(/\s+/g, " ").trim().slice(0, 180)
      : "";
  if (
    !paystackPlanResponse.ok ||
    !isRecord(paystackPlanBody) ||
    paystackPlanBody.status !== true ||
    !isRecord(paystackPlanData)
  ) {
    console.error(
      `[PAYSTACK CHECKOUT] Plan lookup rejected (HTTP ${paystackPlanResponse.status}${providerMessage ? `: ${providerMessage}` : ""}).`,
    );
    const reason =
      paystackPlanResponse.status === 401 ||
      paystackPlanResponse.status === 403
        ? "provider_auth_failed"
        : "plan_lookup_failed";
    return json({
      ok: false,
      reason,
      paystack_status: paystackPlanResponse.status,
      paystack_message: providerMessage || null,
      configured_plan_code: planCode,
      mode: paystackMode,
    }, 503);
  }

  const planChecks = {
    code: paystackPlanData.plan_code === planCode,
    amount: paystackPlanData.amount === expectedAmount,
    currency: paystackPlanData.currency === "NGN",
    interval: paystackPlanData.interval === "monthly",
  };
  const failedChecks = Object.entries(planChecks)
    .filter(([, passed]) => !passed)
    .map(([check]) => check);
  if (
    failedChecks.length > 0
  ) {
    console.error(
      `[PAYSTACK CHECKOUT] Configured plan failed validation: ${failedChecks.join(", ")}.`,
    );
    return json({
      ok: false,
      reason: "plan_configuration_mismatch",
      failed_checks: failedChecks,
      expected: {
        amount_ngn: plan.monthly_price_ngn,
        amount_kobo: expectedAmount,
        currency: "NGN",
        interval: "monthly",
      },
      actual: {
        amount_kobo: paystackPlanData.amount,
        currency: paystackPlanData.currency,
        interval: paystackPlanData.interval,
      },
    }, 503);
  }

  const reference = `avelune_${crypto.randomUUID().replaceAll("-", "")}`;
  const { error: insertError } = await admin.from("paystack_checkouts").insert({
    reference,
    user_id: userData.user.id,
    tier_key: plan.tier_key,
    plan_code: planCode,
    customer_email: userData.user.email.toLowerCase(),
    expected_amount_kobo: expectedAmount,
  });
  if (insertError) {
    console.error("[PAYSTACK CHECKOUT] Checkout reservation failed.", insertError);
    return json({ ok: false, reason: "checkout_unavailable" }, 500);
  }

  async function markCheckoutFailed() {
    const { error } = await admin
      .from("paystack_checkouts")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("reference", reference);
    if (error) {
      console.error("[PAYSTACK CHECKOUT] Could not mark failed checkout.", error);
    }
  }

  let providerResponse: Response;
  try {
    providerResponse = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${paystackSecret}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({
          email: userData.user.email,
          amount: expectedAmount,
          plan: planCode,
          reference,
          callback_url: callbackUrl,
          metadata: {
            user_id: userData.user.id,
            tier_key: plan.tier_key,
          },
        }),
      },
    );
  } catch (error) {
    console.error("[PAYSTACK CHECKOUT] Provider request failed.", error);
    await markCheckoutFailed();
    return json({ ok: false, reason: "provider_unavailable" }, 502);
  }

  let providerBody: unknown;
  try {
    providerBody = await providerResponse.json();
  } catch (error) {
    console.error("[PAYSTACK CHECKOUT] Provider returned invalid JSON.", error);
    await markCheckoutFailed();
    return json({ ok: false, reason: "provider_unavailable" }, 502);
  }

  if (
    !providerResponse.ok ||
    !isRecord(providerBody) ||
    providerBody.status !== true ||
    !isRecord(providerBody.data) ||
    typeof providerBody.data.authorization_url !== "string"
  ) {
    console.error(
      `[PAYSTACK CHECKOUT] Provider initialization failed with HTTP ${providerResponse.status}.`,
    );
    await markCheckoutFailed();
    return json({ ok: false, reason: "provider_rejected" }, 502);
  }

  let authorizationUrl: URL;
  try {
    authorizationUrl = new URL(providerBody.data.authorization_url);
  } catch {
    await markCheckoutFailed();
    return json({ ok: false, reason: "provider_response_invalid" }, 502);
  }
  if (
    authorizationUrl.protocol !== "https:" ||
    authorizationUrl.hostname !== "checkout.paystack.com"
  ) {
    console.error("[PAYSTACK CHECKOUT] Provider returned an unexpected checkout host.");
    await markCheckoutFailed();
    return json({ ok: false, reason: "provider_response_invalid" }, 502);
  }

  return json({
    ok: true,
    authorization_url: authorizationUrl.toString(),
    reference,
  });
});
