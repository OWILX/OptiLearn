# Paystack integration setup

## Supabase secrets

For testing, set the **test** secret key and your deployed app's public origin:

```sh
supabase secrets set PAYSTACK_MODE="test" PAYSTACK_SECRET_KEY="your-test-secret-key" APP_URL="https://your-app.example"
```

Do not commit either value or put the Paystack secret key in frontend code.
The supplied Plus and Pro plan codes are stored as test plan codes in
`plan_catalog` by the `20261011150000_paystack_plan_checkout.sql` migration.
The function verifies that a configured plan is monthly and its NGN amount
matches the editable catalog price before starting checkout. Before going live,
create live-mode plans in the same Paystack account, set their codes in
`paystack_live_plan_code`, then set `PAYSTACK_MODE="live"` and the matching
live secret key in Supabase. Test-mode plan codes will not work with live
credentials.

## Deploy

Apply the database migrations, then deploy the authenticated checkout function
and the unauthenticated-but-signature-verified webhook:

```sh
supabase functions deploy create-paystack-checkout
supabase functions deploy paystack-webhook --no-verify-jwt
```

For the Paystack **Test webhook URL** field, use:

```text
https://nlenaoincibjuyejhmak.supabase.co/functions/v1/paystack-webhook
```

If your Supabase project ref differs, replace it with the ref from your
Supabase Project URL.

Set the Paystack **Test callback URL** to your public app origin followed by
`/plans?payment=success`; for example:

```text
https://your-app.example/plans?payment=success
```

The checkout request supplies the same callback from `APP_URL`. The browser
redirect is informational only; it never activates a plan. The webhook
verifies Paystack's signature and verifies each successful transaction with
Paystack before recording payment. Paid access is granted only after both the
payment and the associated subscription details are present.

For production, configure `PAYSTACK_MODE="live"`, the live `PAYSTACK_SECRET_KEY`,
and the Netlify production origin as `APP_URL` in Supabase secrets. Configure
the Paystack live webhook to the same Supabase webhook endpoint and the live
callback URL to `<production-origin>/plans?payment=success`. Verify the live
plan codes, NGN amount, and monthly interval before accepting payments. Keep a
user's current tier and billing unchanged while a requested Plus/Pro tier
change is pending; the application does not yet apply a provider plan change
at renewal.

## Applying the database changes

From the repository's `avelune+` directory, link the CLI to the Supabase
project and apply all pending migrations before deploying the functions:

```sh
supabase link --project-ref nlenaoincibjuyejhmak
supabase db push
supabase functions deploy ask-ai
supabase functions deploy create-paystack-checkout
supabase functions deploy paystack-webhook --no-verify-jwt
```

If this project is already linked, the `supabase link` command is unnecessary.
Do not use `--prune` when deploying functions.

If checkout returns HTTP 503, inspect the function logs and the response body:
`plan_unavailable` means the database migration or test plan code is missing;
`plan_configuration_mismatch` means the Paystack test plan's amount, NGN
currency, or monthly interval does not match the `plan_catalog` entry.
