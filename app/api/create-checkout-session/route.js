// app/api/create-checkout-session/route.js
export const runtime = 'nodejs';

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

export async function POST(req) {
  try {
    const { campaignId, packPrice, packEntries, promo } = await req.json();

    if (!process.env.STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: 'Missing STRIPE_SECRET_KEY' }), { status: 500 });
    }

    // Basic validation / normalization
    const priceNum = Number(packPrice);
    const entriesNum = Math.floor(Number(packEntries));
    if (!campaignId || !Number.isFinite(priceNum) || priceNum <= 0 || !Number.isFinite(entriesNum) || entriesNum <= 0) {
      return new Response(JSON.stringify({ error: 'Invalid input' }), { status: 400 });
    }

    // Build success/cancel from request origin (works local, preview, prod)
    const { origin } = new URL(req.url);
    const success = `${origin}/c/${encodeURIComponent(campaignId)}?checkout=success`;
    const cancel  = `${origin}/c/${encodeURIComponent(campaignId)}?canceled=1`;

    // Try to auto-apply a live promotion code (safe to ignore failures)
    let discounts;
    if (promo) {
      try {
        const found = await stripe.promotionCodes.list({ code: String(promo), active: true, limit: 1 });
        if (found?.data?.[0]?.id) discounts = [{ promotion_code: found.data[0].id }];
      } catch { /* ignore */ }
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: success,
      cancel_url: cancel,
      allow_promotion_codes: true,
      ...(discounts ? { discounts } : {}),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(priceNum * 100),
            product_data: {
              name: `GiftSplit: ${entriesNum} entries`,
              // product metadata is optional; webhook reads session metadata below
              metadata: { campaignId, packEntries: entriesNum, packPrice: priceNum },
            },
          },
        },
      ],
      // IMPORTANT: send keys your webhook expects.
      // Provide both snake_case and camelCase for maximum compatibility.
      metadata: {
        campaign: campaignId,
        page_id: campaignId,
        campaignId,
        packEntries: entriesNum,
        packPrice: priceNum,
        ...(promo ? { promo: String(promo) } : {}),
      },
    });

    return Response.json({ url: session.url });
  } catch (e) {
    console.error('create-checkout-session error:', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
}
