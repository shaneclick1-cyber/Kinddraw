import Stripe from 'stripe';

export const runtime = 'nodejs';

export async function POST(req) {
  try {
    const { campaignId, packPrice, packEntries, promo } = await req.json();

    if (!process.env.STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: 'Missing STRIPE_SECRET_KEY' }), { status: 500 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    // Build success/cancel from the incoming request origin (works local & prod)
    const { origin } = new URL(req.url);
    const success = `${origin}/c/${campaignId}?ok=1`;
    const cancel  = `${origin}/c/${campaignId}?canceled=1`;

    // Optional: try to auto-apply a promotion code passed from the client (?promo=...)
    let discounts;
    if (promo) {
      try {
        const found = await stripe.promotionCodes.list({ code: String(promo), active: true, limit: 1 });
        if (found?.data?.[0]?.id) {
          discounts = [{ promotion_code: found.data[0].id }];
        }
      } catch {
        // Silently ignore lookup errors; user can still enter a code on the Checkout page
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: success,
      cancel_url: cancel,
      allow_promotion_codes: true, // shows "Add promotion code" on Stripe Checkout
      ...(discounts ? { discounts } : {}), // auto-apply if we found one
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(Number(packPrice) * 100),
            product_data: {
              name: `KindDraw: ${packEntries} entries`,
              metadata: { campaignId, packEntries, packPrice },
            },
          },
        },
      ],
      metadata: { campaignId, packEntries, packPrice, ...(promo ? { promo } : {}) },
    });

    return Response.json({ url: session.url });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
}
