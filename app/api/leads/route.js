import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export async function GET(req) {
  const missing = [];
  if (!process.env.SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');

  const url = new URL(req.url);
  if (url.searchParams.get('ping') === '1') {
    try {
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false } }
      );
      const { error } = await supabase.from('leads').select('id', { head: true, count: 'exact' });
      if (error) return NextResponse.json({ ok:false, stage:'ping', error: error.message }, { status: 500 });
      return NextResponse.json({ ok:true, stage:'ping' });
    } catch (e) {
      return NextResponse.json({ ok:false, stage:'ping', error: String(e), code: e?.cause?.code }, { status: 500 });
    }
  }

  // handy to verify what URL you actually loaded (no secrets)
  const host = process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).host : null;
  return NextResponse.json({ ok: true, env_ok: missing.length === 0, missing, host });
}

export async function POST(req) {
  try {
    const body = await req.json();

    const need = [
      'full_name','email','campaign_name','beneficiary',
      'winner_share_pct','price_per_entry','entry_cap_total','amoe_address'
    ];
    for (const k of need) {
      if (!body[k] && body[k] !== 0) {
        return NextResponse.json({ ok:false, error:`Missing field: ${k}` }, { status: 400 });
      }
    }

    const { searchParams } = new URL(req.url);
    if (searchParams.get('dry') === '1') {
      return NextResponse.json({ ok:true, mode:'dry', echo: body });
    }

    const baseUrl = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!baseUrl || !key) {
      return NextResponse.json({ ok:false, error:'Missing env SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 });
    }

    // --- Preflight network/TLS check (with robust URL + logs) ---
    let healthUrl;
    try {
      healthUrl = new URL('auth/v1/health', baseUrl).toString();
    } catch (e) {
      return NextResponse.json(
        { ok:false, stage:'preflight', error:`Invalid SUPABASE_URL (${baseUrl})`, code:'BAD_URL' },
        { status: 500 }
      );
    }

    // Log target (no secrets)
    try {
      // eslint-disable-next-line no-console
      console.error('[LEADS] Preflight host:', new URL(baseUrl).host);
      // eslint-disable-next-line no-console
      console.error('[LEADS] Preflight URL:', healthUrl);
    } catch {}

    try {
      const h = await fetch(healthUrl, { headers: { apikey: key } });
      if (!h.ok) {
        return NextResponse.json({ ok:false, stage:'preflight', status: h.status }, { status: 500 });
      }
    } catch (e) {
      return NextResponse.json({ ok:false, stage:'preflight', error: String(e), code: e?.cause?.code }, { status: 500 });
    }
    // ------------------------------------------------------------

    const supabase = createClient(baseUrl, key, { auth: { persistSession: false } });

    const { data, error } = await supabase
      .from('leads')
      .insert([{
        full_name: body.full_name,
        email: body.email,
        phone: body.phone ?? null,
        purpose: body.purpose ?? null,
        campaign_name: body.campaign_name,
        beneficiary: body.beneficiary,
        goal_usd: body.goal_usd ?? null,
        start_et: body.start_et ?? null,
        end_et: body.end_et ?? null,
        state_exclusions: body.state_exclusions ?? null,
        winner_share_pct: Number(body.winner_share_pct),
        price_per_entry: Number(body.price_per_entry),
        packs_displayed: body.packs_displayed ?? null,
        entry_cap_total: Number(body.entry_cap_total),
        amoe_address: body.amoe_address,
        amoe_pacing: body.amoe_pacing ?? null,
        story_short: body.story_short ?? null,
        photo_url: body.photo_url ?? null,
        source: body.source ?? null,
        user_agent: req.headers.get('user-agent'),
        ip: req.headers.get('x-forwarded-for') || null
      }])
      .select('id')
      .single();

    if (error) {
      // eslint-disable-next-line no-console
      console.error('Supabase insert error:', error);
      return NextResponse.json(
        { ok:false, error: error.message, code: error.code, details: error.details, hint: error.hint },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok:true, id: data.id });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('API /leads error:', e);
    return NextResponse.json({ ok:false, error: String(e) }, { status: 500 });
  }
}
