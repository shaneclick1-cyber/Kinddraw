export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req) {
  const url = new URL(req.url);
  const campaign = url.searchParams.get('campaign');
  const entries  = Number(url.searchParams.get('entries') || 0);
  const cents    = Number(url.searchParams.get('cents') || 0);

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return NextResponse.json({ ok:false, error:'Missing Supabase envs' }, { status:500 });
  }
  if (!campaign || entries <= 0) {
    return NextResponse.json({ ok:false, error:'campaign and entries required' }, { status:400 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const row = {
    campaign_id: campaign,
    entries,
    amount_cents: cents,
    currency: 'usd',
    status: cents > 0 ? 'paid' : 'no_payment_required',
    stripe_session_id: `manual_${Date.now()}`
  };

  const { error } = await supabase.from('orders2').upsert(row, { onConflict: 'stripe_session_id' });
  if (error) return NextResponse.json({ ok:false, error: String(error) }, { status:500 });

  return NextResponse.json({ ok:true, inserted: row });
}
