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
    process.env.STRIPE_WEBHOOKS_SECRET || process.env.STRIPE_WEBHOOK_SECRET;

  if (!process.env.STRIPE_SECRET_KEY || !endpointSecret) {
    return new Response('Missing STRIPE_SECRET_KEY or endpoint secret', { status: 500 });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return new Response('Missing Supabase server creds', { status: 500 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  // Stripe signature verification requires the RAW body
  const sig = req.headers.get('stripe-signature');
  const rawBody = Buffer.from(await req.arrayBuffer());

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
  } catch (err) {
    console.error('⚠️  Signature verify failed:', err?.message);
    return new Response(`Webhook signature verification failed`, { status: 400 });
  }

  // Use SERVICE ROLE here (server only)
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Helper: upsert a paid order row
  async function recordPaidSession(sessionId) {
    // Always re-fetch with expands so we have reliable totals/discounts
    const s = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items', 'total_details', 'discounts'],
    });

    const campaignId   = s.metadata?.campaignId || null;
    const packEntries  = Number(s.metadata?.packEntries || 0);
    const amountCents  =
      typeof s.amount_total === 'number'
        ? s.amount_total
        : (s.line_items?.data?.reduce((sum, li) => sum + (li.amount_total ?? 0), 0) || 0);
    const discountCents = s.total_details?.amount_discount || 0;
    const promoCodeId   =
      Array.isArray(s.discounts) && s.discounts[0]?.promotion_code
        ? s.discounts[0].promotion_code
        : null;

    if (!campaignId || !(packEntries > 0)) {
      console.warn('Skipping insert: missing campaignId or packEntries', { campaignId, packEntries });
      return;
    }

    const { error } = await supabase
      .from('orders')
      .upsert(
        {
          campaign_id: campaignId,
          entries: packEntries,
          amount_cents: amountCents,
          currency: (s.currency || 'usd').toLowerCase(),
          status: 'paid',
          stripe_session_id: s.id,
          discount_cents: discountCents,
          promo_code_id: promoCodeId,
        },
        { onConflict: 'stripe_session_id' }
      );

    if (error) {
      console.error('Supabase upsert error:', error);
      // Return 200 so Stripe doesn't retry endlessly, but log loudly
    }
  }

  try {
    switch (event.type) {
      // Immediate confirmation
      case 'checkout.session.completed': {
        const sess = event.data.object;
        // Only record if it's actually paid (not 'unpaid' for async)
        if (sess.payment_status === 'paid') {
          await recordPaidSession(sess.id);
        } else {
          // For async wallets (eg. iDEAL), a later event will confirm
          console.log('Session completed but not paid yet:', sess.payment_status);
        }
        break;
      }

      // Async payment flows: confirm later after completion
      case 'checkout.session.async_payment_succeeded': {
        const sess = event.data.object;
        await recordPaidSession(sess.id);
        break;
      }

      // Refunds: mark row as refunded so totals drop
      case 'charge.refunded':
      case 'refund.created': {
        const charge = event.data.object;
        if (charge?.payment_intent) {
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
        // Ignore other events
        break;
    }

    // Always 200 so Stripe stops retrying when we’ve handled it
    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error('Webhook handler error:', err);
    // Still return 200 to avoid endless retries on non-retryable errors
    return new Response('ok', { status: 200 });
  }
}
