// app/api/webhooks/stripe/route.js
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return new Response('ok', { status: 200 });
}

export async function POST(req) {
  const endpointSecret =
    process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOKS_SECRET;

  if (!process.env.STRIPE_SECRET_KEY || !endpointSecret) {
    return new Response('Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET', { status: 500 });
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return new Response('Missing Supabase envs', { status: 500 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

  // Verify signature using RAW body
  let event;
  try {
    const sig = req.headers.get('stripe-signature');
    const rawBody = await req.text();
    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
  } catch (err) {
    console.error('⚠️  Signature verification failed:', err?.message);
    return new Response('Bad signature', { status: 400 });
  }

  // Server-only Supabase client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  async function upsertFromSession(s) {
    // Campaign id from either key
    const campaign_id =
      s.metadata?.campaign ||
      s.metadata?.campaignId ||
      'default';

    // Prefer explicit entries (works with 100% promo)
    const metaEntries = Number(s.metadata?.packEntries || 0);

    // Amount & currency
    const amount_cents = typeof s.amount_total === 'number' ? s.amount_total : 0;
    const currency = (s.currency || 'usd').toLowerCase();

    // Fallback: $1 = 1 entry
    const entries = metaEntries > 0 ? metaEntries : Math.max(0, Math.floor((amount_cents || 0) / 100));

    // Accept free checkouts too
    const status = (s.payment_status === 'paid' || s.payment_status === 'no_payment_required')
      ? s.payment_status
      : (s.payment_status || 'completed');

    // Discounts
    const discount_cents = s.total_details?.amount_discount ?? 0;
    // Try to capture a promo id if present
    const promo_code_id =
      s.total_details?.breakdown?.discounts?.[0]?.discount?.id ??
      s.discounts?.[0]?.promotion_code ??
      null;

    if (!campaign_id || entries <= 0) {
      console.warn('Skipping upsert: missing campaign_id or entries<=0', { campaign_id, entries, amount_cents });
      return;
    }

    const row = {
      campaign_id,
      entries,
      amount_cents,
      currency,
      status,
      stripe_session_id: s.id,
      discount_cents,
      promo_code_id
      // NOTE: no page_id here to match your existing table
    };

    const { error } = await supabase
      .from('orders')
      .upsert(row, { onConflict: 'stripe_session_id' });

    if (error) console.error('Supabase upsert error:', error, { row });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object;
        if (s.payment_status === 'paid' || s.payment_status === 'no_payment_required') {
          await upsertFromSession(s);
        } else {
          // async wallets may confirm later
          console.log('Session completed but not finalized yet:', s.payment_status);
        }
        break;
      }
      case 'checkout.session.async_payment_succeeded': {
        await upsertFromSession(event.data.object);
        break;
      }
      case 'charge.refunded':
      case 'refund.created': {
        const charge = event.data.object;
        if (charge?.payment_intent) {
          const list = await stripe.checkout.sessions.list({ payment_intent: charge.payment_intent, limit: 1 });
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

    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error('Webhook handler error:', err);
    return new Response('ok', { status: 200 }); // prevent endless retries
  }
}
