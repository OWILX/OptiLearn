import { createClient } from "npm:@supabase/supabase-js@2";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nestedRecord(
  value: unknown,
  key: string,
): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const nested = value[key];
  return isRecord(nested) ? nested : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function validDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function isValidSignature(
  body: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
  );
  const expected = toHex(digest);
  if (signature.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= signature.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

function getPlanCode(data: Record<string, unknown>): string | null {
  // Paystack sends the plan differently depending on payload: a bare string on
  // transaction payloads, an object carrying plan_code on subscription events,
  // and a plan_object record on some transaction verify responses.
  const rawPlan = data.plan;
  if (typeof rawPlan === "string") {
    const trimmed = rawPlan.trim();
    if (trimmed) return trimmed;
  }
  return nonEmptyString(nestedRecord(data, "plan")?.plan_code) ??
    nonEmptyString(nestedRecord(data, "plan_object")?.plan_code) ??
    nonEmptyString(data.plan_code);
}

function getCustomer(data: Record<string, unknown>) {
  return nestedRecord(data, "customer");
}

function getSubscription(data: Record<string, unknown>) {
  return nestedRecord(data, "subscription") ?? data;
}

interface PaystackSubscriptionDetails {
  subscriptionCode: string;
  customerCode: string | null;
  emailToken: string | null;
  periodEnd: string | null;
}

async function fetchSubscriptionFromPaystack(
  secret: string,
  planCode: string,
  customerEmail: string,
): Promise<PaystackSubscriptionDetails | null> {
  // Paystack does not deliver subscription.create for subscriptions opened by
  // paying a plan transaction, and transaction verify payloads carry no
  // subscription details. Resolve them from the API instead.
  let response: Response;
  try {
    response = await fetch("https://api.paystack.co/subscription", {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    console.error("[PAYSTACK WEBHOOK] Subscription lookup request failed.", error);
    return null;
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    console.error("[PAYSTACK WEBHOOK] Subscription lookup returned invalid JSON.", error);
    return null;
  }
  if (!response.ok || !isRecord(body) || body.status !== true) {
    console.error(
      `[PAYSTACK WEBHOOK] Subscription lookup failed with HTTP ${response.status}.`,
    );
    return null;
  }

  const matches = (Array.isArray(body.data) ? body.data : []).filter(
    (entry): entry is Record<string, unknown> =>
      isRecord(entry) &&
      getPlanCode(entry) === planCode &&
      nonEmptyString(nestedRecord(entry, "customer")?.email)?.toLowerCase() ===
        customerEmail.toLowerCase(),
  );
  // Paystack returns the newest subscription first.
  const latest = matches.find((entry) => entry.status === "active") ?? matches[0];
  if (!latest) return null;

  const customer = nestedRecord(latest, "customer");
  const subscriptionCode = nonEmptyString(latest.subscription_code);
  if (!subscriptionCode) return null;
  return {
    subscriptionCode,
    customerCode: nonEmptyString(customer?.customer_code),
    emailToken: nonEmptyString(latest.email_token),
    periodEnd: validDate(latest.next_payment_date),
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false }, 405);

  const secret = Deno.env.get("PAYSTACK_SECRET_KEY") ?? "";
  const paystackMode = Deno.env.get("PAYSTACK_MODE") ?? "";
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (
    !secret ||
    (paystackMode !== "test" && paystackMode !== "live") ||
    !url ||
    !service
  ) {
    console.error("[PAYSTACK WEBHOOK] Required server configuration is missing.");
    return json({ ok: false }, 500);
  }
  const expectedKeyPrefix = paystackMode === "test" ? "sk_test_" : "sk_live_";
  if (!secret.startsWith(expectedKeyPrefix)) {
    console.error("[PAYSTACK WEBHOOK] Secret key does not match PAYSTACK_MODE.");
    return json({ ok: false }, 500);
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature") ?? "";
  try {
    if (!signature || !(await isValidSignature(rawBody, signature, secret))) {
      console.warn("[PAYSTACK WEBHOOK] Rejected request with invalid signature.");
      return json({ ok: false }, 401);
    }
  } catch (error) {
    console.error("[PAYSTACK WEBHOOK] Signature verification failed.", error);
    return json({ ok: false }, 500);
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ ok: false }, 400);
  }
  if (!isRecord(event) || typeof event.event !== "string" || !isRecord(event.data)) {
    return json({ ok: false }, 400);
  }

  const admin = createClient(url, service);

  async function activateCheckout(reference: string) {
    const { data: checkout, error: checkoutError } = await admin
      .from("paystack_checkouts")
      .select("*")
      .eq("reference", reference)
      .maybeSingle();
    if (checkoutError) throw checkoutError;
    if (!checkout || checkout.status !== "paid") return;
    if (
      !checkout.provider_subscription_code ||
      !checkout.current_period_end ||
      !checkout.provider_customer_code
    ) {
      return;
    }

    const periodEnd = validDate(checkout.current_period_end);
    if (!periodEnd || new Date(periodEnd).getTime() <= Date.now()) return;

    const now = new Date().toISOString();
    const { error: subscriptionError } = await admin
      .from("user_subscriptions")
      .upsert(
        {
          user_id: checkout.user_id,
          tier_key: checkout.tier_key,
          status: "active",
          provider: "paystack",
          provider_customer_code: checkout.provider_customer_code,
          provider_subscription_code: checkout.provider_subscription_code,
          provider_email_token: checkout.provider_email_token,
          current_period_start: now,
          current_period_end: periodEnd,
          cancel_at_period_end: false,
          paystack_reference: reference,
          updated_at: now,
        },
        { onConflict: "user_id" },
      );
    if (subscriptionError) throw subscriptionError;

    const { error: profileError } = await admin
      .from("profiles")
      .update({
        premium: true,
        premium_since: now,
        premium_expires_at: periodEnd,
      })
      .eq("id", checkout.user_id);
    if (profileError) throw profileError;

    const { error: checkoutUpdateError } = await admin
      .from("paystack_checkouts")
      .update({ status: "activated", updated_at: now })
      .eq("reference", reference);
    if (checkoutUpdateError) throw checkoutUpdateError;
  }

  if (event.event === "charge.success") {
    const reference = nonEmptyString(event.data.reference);
    if (!reference) return json({ ok: false }, 400);

    let verifyResponse: Response;
    try {
      verifyResponse = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        {
          headers: { Authorization: `Bearer ${secret}` },
          signal: AbortSignal.timeout(15_000),
        },
      );
    } catch (error) {
      console.error("[PAYSTACK WEBHOOK] Transaction verification request failed.", error);
      return json({ ok: false }, 502);
    }

    let verified: unknown;
    try {
      verified = await verifyResponse.json();
    } catch (error) {
      console.error("[PAYSTACK WEBHOOK] Verification response was invalid JSON.", error);
      return json({ ok: false }, 502);
    }
    const transaction = nestedRecord(verified, "data");
    if (
      !verifyResponse.ok ||
      !isRecord(verified) ||
      verified.status !== true ||
      !transaction ||
      transaction.status !== "success" ||
      transaction.reference !== reference ||
      transaction.currency !== "NGN"
    ) {
      console.error(
        `[PAYSTACK WEBHOOK] Transaction verification failed with HTTP ${verifyResponse.status}.`,
      );
      return json({ ok: false }, 502);
    }

    const { data: checkout, error: checkoutError } = await admin
      .from("paystack_checkouts")
      .select("*")
      .eq("reference", reference)
      .maybeSingle();
    if (checkoutError) {
      console.error("[PAYSTACK WEBHOOK] Checkout lookup failed.", checkoutError);
      return json({ ok: false }, 500);
    }

    if (checkout) {
      const code = getPlanCode(transaction);
      const customer = getCustomer(transaction);
      const metadata = nestedRecord(transaction, "metadata");
      if (
        transaction.amount !== checkout.expected_amount_kobo ||
        code !== checkout.plan_code ||
        nonEmptyString(customer?.email)?.toLowerCase() !== checkout.customer_email ||
        nonEmptyString(metadata?.user_id) !== checkout.user_id ||
        nonEmptyString(metadata?.tier_key) !== checkout.tier_key
      ) {
        console.error("[PAYSTACK WEBHOOK] Verified payment did not match checkout.");
        return json({ ok: false }, 400);
      }

      const subscription = getSubscription(transaction);
      let subscriptionCode =
        nonEmptyString(subscription.subscription_code) ??
        nonEmptyString(transaction.subscription_code) ??
        checkout.provider_subscription_code;
      let customerCode =
        nonEmptyString(customer?.customer_code) ??
        checkout.provider_customer_code;
      let emailToken =
        nonEmptyString(subscription.email_token) ??
        nonEmptyString(transaction.email_token) ??
        checkout.provider_email_token;
      let periodEnd =
        validDate(subscription.next_payment_date) ??
        validDate(transaction.next_payment_date) ??
        checkout.current_period_end;

      // The verify payload carries no subscription, so pull the details from
      // Paystack when the transaction and the existing row have none.
      if (!subscriptionCode || !customerCode || !periodEnd) {
        const resolved = await fetchSubscriptionFromPaystack(
          secret,
          checkout.plan_code,
          checkout.customer_email,
        );
        if (resolved) {
          subscriptionCode ??= resolved.subscriptionCode;
          customerCode ??= resolved.customerCode;
          emailToken ??= resolved.emailToken;
          periodEnd ??= resolved.periodEnd;
        } else {
          console.error(
            "[PAYSTACK WEBHOOK] Could not resolve the Paystack subscription for this checkout.",
            JSON.stringify({
              planCode: checkout.plan_code,
              customerEmail: checkout.customer_email,
            }),
          );
        }
      }

      const { error: updateError } = await admin
        .from("paystack_checkouts")
        .update({
          status: "paid",
          provider_subscription_code: subscriptionCode,
          provider_customer_code: customerCode,
          provider_email_token: emailToken,
          current_period_end: periodEnd,
          updated_at: new Date().toISOString(),
        })
        .eq("reference", reference);
      if (updateError) {
        console.error("[PAYSTACK WEBHOOK] Checkout update failed.", updateError);
        return json({ ok: false }, 500);
      }

      try {
        await activateCheckout(reference);
      } catch (error) {
        console.error("[PAYSTACK WEBHOOK] Subscription activation failed.", error);
        return json({ ok: false }, 500);
      }
      console.log(
        "[PAYSTACK WEBHOOK] charge.success processed.",
        JSON.stringify({
          reference,
          eventDataKeys: Object.keys(event.data),
          subscriptionCode,
          periodEnd,
        }),
      );
      return json({ ok: true });
    }

    const subscription = getSubscription(transaction);
    const subscriptionCode =
      nonEmptyString(subscription.subscription_code) ??
      nonEmptyString(transaction.subscription_code);
    const periodEnd =
      validDate(subscription.next_payment_date) ??
      validDate(transaction.next_payment_date);
    if (!subscriptionCode || !periodEnd) {
      console.warn("[PAYSTACK WEBHOOK] Renewal lacks subscription or period details.");
      return json({ ok: true });
    }

    const { data: current, error: currentError } = await admin
      .from("user_subscriptions")
      .select("user_id, tier_key, status")
      .eq("provider_subscription_code", subscriptionCode)
      .maybeSingle();
    if (currentError) {
      console.error("[PAYSTACK WEBHOOK] Renewal subscription lookup failed.", currentError);
      return json({ ok: false }, 500);
    }
    if (!current) return json({ ok: true });

    const { data: plan, error: planError } = await admin
      .from("plan_catalog")
      .select(
        "paystack_test_plan_code, paystack_live_plan_code, monthly_price_ngn",
      )
      .eq("tier_key", current.tier_key)
      .maybeSingle();
    if (planError) {
      console.error("[PAYSTACK WEBHOOK] Renewal plan lookup failed.", planError);
      return json({ ok: false }, 500);
    }
    const currentPlanCode = plan
      ? paystackMode === "test"
        ? plan.paystack_test_plan_code
        : plan.paystack_live_plan_code
      : null;
    if (
      !plan ||
      typeof currentPlanCode !== "string" ||
      getPlanCode(transaction) !== currentPlanCode ||
      transaction.amount !== plan.monthly_price_ngn * 100
    ) {
      console.error("[PAYSTACK WEBHOOK] Renewal plan does not match active subscription.");
      return json({ ok: false }, 400);
    }

    const now = new Date().toISOString();
    const { error: renewalError } = await admin
      .from("user_subscriptions")
      .update({
        status: "active",
        current_period_start: now,
        current_period_end: periodEnd,
        updated_at: now,
      })
      .eq("provider_subscription_code", subscriptionCode);
    if (renewalError) {
      console.error("[PAYSTACK WEBHOOK] Renewal period update failed.", renewalError);
      return json({ ok: false }, 500);
    }
    const { error: profileError } = await admin
      .from("profiles")
      .update({ premium: true, premium_expires_at: periodEnd })
      .eq("id", current.user_id);
    if (profileError) {
      console.error("[PAYSTACK WEBHOOK] Renewal profile update failed.", profileError);
      return json({ ok: false }, 500);
    }
    return json({ ok: true });
  }

  if (event.event === "subscription.create") {
    const data = event.data;
    const planCode = getPlanCode(data);
    const customer = getCustomer(data);
    const subscription = getSubscription(data);
    const customerEmail = nonEmptyString(customer?.email)?.toLowerCase();
    const customerCode = nonEmptyString(customer?.customer_code);
    const subscriptionCode = nonEmptyString(subscription.subscription_code);
    const emailToken = nonEmptyString(subscription.email_token);
    const periodEnd =
      validDate(subscription.next_payment_date) ??
      validDate(data.next_payment_date);

    if (!planCode || !customerEmail || !customerCode || !subscriptionCode || !periodEnd) {
      console.error(
        "[PAYSTACK WEBHOOK] Subscription event is missing required fields.",
        JSON.stringify({
          dataKeys: Object.keys(data),
          planCode,
          customerEmail,
          customerCode,
          subscriptionCode,
          periodEnd,
        }),
      );
      return json({ ok: false }, 400);
    }

    const { data: checkout, error: checkoutError } = await admin
      .from("paystack_checkouts")
      .select("reference, status")
      .eq("plan_code", planCode)
      .eq("customer_email", customerEmail)
      .in("status", ["pending", "paid"])
      .gte(
        "created_at",
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      )
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (checkoutError) {
      console.error("[PAYSTACK WEBHOOK] Subscription checkout match failed.", checkoutError);
      return json({ ok: false }, 500);
    }
    if (!checkout) {
      console.warn(
        "[PAYSTACK WEBHOOK] Subscription did not match a checkout.",
        JSON.stringify({ planCode, customerEmail }),
      );
      return json({ ok: true });
    }

    const { error: updateError } = await admin
      .from("paystack_checkouts")
      .update({
        provider_customer_code: customerCode,
        provider_subscription_code: subscriptionCode,
        provider_email_token: emailToken,
        current_period_end: periodEnd,
        updated_at: new Date().toISOString(),
      })
      .eq("reference", checkout.reference);
    if (updateError) {
      console.error("[PAYSTACK WEBHOOK] Subscription details update failed.", updateError);
      return json({ ok: false }, 500);
    }

    try {
      await activateCheckout(checkout.reference);
    } catch (error) {
      console.error("[PAYSTACK WEBHOOK] Subscription activation failed.", error);
      return json({ ok: false }, 500);
    }
    return json({ ok: true });
  }

  console.warn(`[PAYSTACK WEBHOOK] Ignored event type: ${event.event}`);
  return json({ ok: true, ignored: true });
});
