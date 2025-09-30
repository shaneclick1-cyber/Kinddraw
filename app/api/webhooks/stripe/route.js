// app/api/webhooks/stripe/route.js
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return new Response('ok', { status: 200 });
}

export async function POST(req) {
  // Prefer STRIPE_WEBHOOK_SECRET; keep legacy fallback if you had it set
  const endpointSecret =
    process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOKS_SECRET;

  if (!process.env.STRIPE_SECRET_KEY || !endpointSecret) {
    return new Response('Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET', { status: 500 });
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return new Response('Missing Supabase envs (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)', { status: 500 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

  // 1) Verify signature (raw body)
  const sig = req.headers.get('stripe-signature');
  let event;
  try {
    const rawBody = await req.text();
    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
  } catch (err) {
    console.error('⚠️  Stripe signature verification failed:', err?.message);
    return new Response('Bad signature', { status: 400 });
  }

  // 2) Server-only Supabase client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Helper: write/overwrite a session row idempotently
  async function upsertOrderFromSession(s) {
    // Campaign/page id from multiple possible keys
    const campaign_id =
      s.metadata?.campaign ||
      s.metadata?.campaignId ||
      'default';

    const page_id =
      s.metadata?.page_id ||
      s.metadata?.campaignId ||
      null;

    // Prefer explicit entries sent via metadata (works with 100% promo)
    const metaEntries = Number(s.metadata?.packEntries || 0);

    // Amount & currency from session
    const amount_cents = typeof s.amount_total === 'number' ? s.amount_total : 0;
    const currency = (s.currency || 'usd').toLowerCase();

    // If packEntries missing, fall back to $1 = 1 entry
    const entries = metaEntries > 0
      ? metaEntries
      : Math.max(0, Math.floor((amount_cents || 0) / 100));

    // Treat both paid and free checkouts as successful
    const status = (s.payment_status === 'paid' || s.payment_status === 'no_payment_required')
      ? s.payment_status
      : (s.payment_status || 'completed');

    // Try to capture a discount/promo identifier if present
    const discounts = s.total_details?.breakdown?.discounts || [];
    const promo_code_id = Array.isArray(discounts) && discounts[0]?.discount?.id
      ? discounts[0].discount.id
      : null;

    if (!campaign_id || entries <= 0) {
      console.warn('Skipping upsert: missing campaign_id or entries<=0', { campaign_id, entries, amount_cents });
      return;
    }

    const { error } = await supabase
      .from('orders')
      .upsert([{
        campaign_id,
        entries,
        amount_cents,
        currency,
        status,
        stripe_session_id: s.id,
        promo_code_id,
        // keep page_id if your schema has it; remove if not used
        page_id: page_id || null
      }], { onConflict: 'stripe_session_id' });

    if (error) console.error('Supabase upsert error:', error);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object;
        // Handle both paid and free (no_payment_required)
        if (s.payment_status === 'paid' || s.payment_status === 'no_payment_required') {
          await upsertOrderFromSession(s);
        } else {
          // Async methods can confirm later
          console.log('Session completed but not finalized yet:', s.payment_status);
        }
        break;
      }

      case 'checkout.session.async_payment_succeeded': {
        const s = event.data.object;
        await upsertOrderFromSession(s);
        break;
      }

      case 'charge.refunded':
      case 'refund.created': {
        const charge = event.data.object;
        if (charge?.payment_intent) {
          // Find the session that created this PI
          const list = await stripe.checkout.sessions.list({
            payment_intent: charge.payment_intent,
            limit: 1,
          });
          const linked = list?.data?.[0];
          if (linked?.id) {
            const { error } = await supabase
              .from('orders')
              .update({ status: 'refunded' })
              .eq('stripe_session_id', linked.id);
            if (error) console.error('Supabase refund update error:', error);
          }
        }
        break;
      }

      default:
        // ignore others
        break;
    }

    // Always 200 after handling
    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error('Webhook handler error:', err);
    // Return 200 to avoid endless retries on non-retryable app errors
    return new Response('ok', { status: 200 });
  }
}
