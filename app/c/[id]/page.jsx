import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import CommentsClient from './CommentsClient';
import CheckoutButton from './CheckoutButton';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function currency(n) {
  const v = Number(n || 0);
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
function parseDateMaybe(s) {
  if (!s) return null;
  const fancy = s.includes('—') ? s.replace(' — ', ' ') : s;
  const d = new Date(fancy);
  return isNaN(d.getTime()) ? null : d;
}

export default async function CampaignPage({ params }) {
  const id = params?.id;

  let campaign = null;
  let errorMsg = null;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    errorMsg = 'Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY env vars.';
  } else if (!id) {
    errorMsg = 'Missing campaign id.';
  } else {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
      const { data, error } = await supabase
        .from('leads')
        .select('id,campaign_name,beneficiary,story_short,photo_url,goal_usd,winner_share_pct,price_per_entry,entry_cap_total,start_et,end_et,packs_displayed,amoe_address,amoe_pacing')
        .eq('id', id)
        .maybeSingle();
      if (error) errorMsg = error.message;
      else campaign = data || null;
    } catch (e) {
      errorMsg = String(e);
    }
  }

  const name = campaign?.campaign_name || 'Campaign';
  const beneficiary = campaign?.beneficiary || '';
  const story = campaign?.story_short || '';
  const photo = campaign?.photo_url || '';
  const goal = Number(campaign?.goal_usd) || 0;
  const prizePct = Number(campaign?.winner_share_pct) || 50;
  const perEntry = Number(campaign?.price_per_entry) || 1;
  const cap = Number(campaign?.entry_cap_total) || 700;
  const packs = Array.isArray(campaign?.packs_displayed) && campaign.packs_displayed.length
    ? campaign.packs_displayed
    : [{ price: 10, entries: 10 }, { price: 20, entries: 25 }, { price: 50, entries: 62 }, { price: 100, entries: 130 }, { price: 500, entries: 700 }];

  const startAt = parseDateMaybe(campaign?.start_et);
  const endAt = parseDateMaybe(campaign?.end_et);

  // === CONFIRMED TOTALS FROM SUPABASE (orders written by Stripe webhooks) ===
  let entriesSold = 0;
  let gross = 0; // dollars actually collected
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data: totals, error: totalsErr } = await supabase.rpc('campaign_totals', { c_id: id });
    if (!totalsErr) {
      const row = Array.isArray(totals) ? totals[0] : totals;
      entriesSold = Number(row?.entries || 0);
      gross = Number(row?.amount_cents || 0) / 100;
    }
  } catch {
    // leave defaults if RPC unavailable
  }

  const estPrize = Math.floor((prizePct / 100) * gross);
  const progressPct = goal > 0 ? Math.min(100, Math.round((gross / goal) * 100)) : 0;

  return (
    <main className="page">
      <header className="nav">
        <div className="navInner">
          <Link className="brand" href="/"><span className="logo">★</span> KindDraw</Link>
          <div className="spacer" />
          <Link className="navLink" href="/start">Start a campaign</Link>
        </div>
      </header>

      <section className="hero">
        <div className="heroInner">
          <div className="left">
            <div className="crumbs tiny muted">
              <Link href="/">Home</Link> <span className="sep">/</span> <span>{name}</span>
            </div>
            <h1 className="title">{name}</h1>
            {beneficiary && <p className="beneficiary">Benefiting <strong>{beneficiary}</strong></p>}

            <div className="mediaCard">
              {photo ? (
                <img className="mediaImg" src={photo} alt={name} />
              ) : (
                <div className="mediaPlaceholder">Campaign photo</div>
              )}
            </div>

            {story && (
              <article className="story">
                <h2>Story</h2>
                <p>{story}</p>
              </article>
            )}

            {/* Pass URL & anon down to avoid client env issues */}
            <CommentsClient
              campaignId={id}
              supabaseUrl={SUPABASE_URL}
              supabaseAnonKey={SUPABASE_ANON_KEY}
            />
          </div>

          <aside className="right">
            <div className="panel">
              {errorMsg && <p className="err">⚠ {errorMsg}</p>}
              <div className="row space">
                <div><div className="tiny muted">Goal</div><div className="big">{goal ? currency(goal) : '—'}</div></div>
                <div><div className="tiny muted">Entries sold</div><div className="big">{entriesSold.toLocaleString()}</div></div>
                <div><div className="tiny muted">Prize share</div><div className="big">{prizePct}%</div></div>
              </div>

              <div className="progressWrap">
                <div className="progressBar" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
                  <span style={{ width: `${progressPct}%` }} />
                </div>
                <div className="tiny muted">{currency(gross)} raised • {progressPct}%</div>
              </div>

              <div className="pillGrid">
                <div className="pill">
                  <div className="tiny muted">Estimated prize</div>
                  <div className="pillNum">{currency(estPrize)}</div>
                </div>
                <div className="pill">
                  <div className="tiny muted">Per-person cap</div>
                  <div className="pillNum">{cap.toLocaleString()} entries</div>
                </div>
              </div>

              <div className="packs">
                <h3>Choose an entry pack</h3>
                <ul className="packList">
                  {packs.map((p, i) => (
                    <li key={`${p.price}-${i}`} className="pack">
                      <div className="packL">
                        <div className="packPrice">{currency(p.price)}</div>
                        <div className="tiny muted">{p.entries.toLocaleString()} entries</div>
                      </div>
                      <div className="packR">
                        {Number(p.price) === 100 ? (
                          <CheckoutButton
                            campaignId={id}
                            packPrice={p.price}
                            packEntries={p.entries}
                          />
                        ) : (
                          <button className="btn btnDark" disabled>Buy</button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="tiny muted center">Or enter free by mail — equal odds.</p>
              </div>

              <div className="fineprint">
                <h4>AMOE</h4>
                <address className="addr">{(campaign?.amoe_address || 'KindDraw\n384 Dorset Street\nBroadway VA, 22815')}</address>
                <p className="tiny muted">Draw rate: {campaign?.amoe_pacing || '200/day up to cap'}</p>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <style dangerouslySetInnerHTML={{ __html: styles }} />
    </main>
  );
}

const styles = `
:root{--ink:#0b1320;--muted:#6b7280;--line:#e5e7eb;--soft:#f7f8fb;--card:#fff;--green:#22c55e;--brand:#0f172a;}
*{box-sizing:border-box}
body{margin:0;font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Helvetica,Arial;color:var(--ink)}
a{color:inherit}
.nav{position:sticky;top:0;background:#fff;border-bottom:1px solid var(--line);z-index:20}
.navInner{max-width:1100px;margin:0 auto;padding:10px 16px;display:flex;align-items:center;gap:16px}
.brand{display:flex;align-items:center;gap:8px;font-weight:800;text-decoration:none}
.logo{display:inline-flex;width:22px;height:22px;align-items:center;justify-content:center;background:var(--green);color:#fff;border-radius:6px;font-size:14px}
.spacer{flex:1}
.hero{background:linear-gradient(180deg,#ffffff,#f7f8fb);border-bottom:1px solid var(--line)}
.heroInner{max-width:1100px;margin:0 auto;display:grid;grid-template-columns:1fr;gap:24px;padding:26px 16px}
@media(min-width:1000px){.heroInner{grid-template-columns:1.15fr .85fr}}
.title{font-size:34px;line-height:1.1;margin:6px 0 4px}
.mediaCard{background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden;aspect-ratio:16/9;position:relative}
.mediaImg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;display:block}
.mediaPlaceholder{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--muted);font-weight:700}
.story{margin-top:16px}
.story h2{font-size:18px;margin:0 0 8px}
.right .panel{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px;box-shadow:0 12px 30px rgba(2,6,23,.06);position:sticky;top:72px}
.row{display:flex;gap:12px;align-items:flex-start}
.space{justify-content:space-between}
.big{font-size:18px;font-weight:800}
.tiny{font-size:12px}
.muted{color:var(--muted)}
.center{text-align:center}
.progressWrap{margin:10px 0 8px}
.progressBar{height:10px;border-radius:999px;background:#f1f5f9;border:1px solid #e2e8f0;overflow:hidden}
.progressBar span{display:block;height:100%;background:var(--brand)}
.pillGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:8px 0}
.pill{background:var(--soft);border:1px solid #e2e8f0;border-radius:12px;padding:10px}
.pillNum{font-weight:800;font-size:18px}
.packs{margin-top:12px}
.packList{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:8px}
.pack{display:flex;align-items:center;justify-content:space-between;border:1px solid var(--line);border-radius:12px;padding:10px;background:#fff}
.packPrice{font-weight:800}
.btn{display:inline-block;padding:10px 14px;border-radius:10px;border:1px solid var(--line);font-weight:800;text-decoration:none;text-align:center;background:#fff}
.btnDark{background:var(--brand);color:#fff;border-color:var(--brand)}
.err{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:8px 10px;border-radius:8px;margin-bottom:8px}
.addr{white-space:pre-wrap;font-style:normal;border:1px dashed #e2e8f0;background:#f8fafc;padding:8px;border-radius:10px;margin-top:8px}
`;
