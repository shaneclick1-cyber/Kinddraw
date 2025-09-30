'use client';

import { useState } from 'react';
import Link from 'next/link';

const PRICE_PER_ENTRY = 1.0;
const ENTRY_CAP_TOTAL = 700;
// user-selectable 25–50 in steps of 5; default 50
const WINNER_SHARE_PCT = 50;

const AMOE_ADDRESS = `KindDraw
384 Dorset Street
Broadway VA, 22815`;
const AMOE_PACING = '200/day up to cap';

const PACKS = [
  { price: 10, entries: 10 },
  { price: 20, entries: 25 },
  { price: 50, entries: 62 },
  { price: 100, entries: 130 },
  { price: 500, entries: 700 },
];

// Fixed purpose categories
const PURPOSE_OPTIONS = ['Medical', 'Travel Teams', 'Education', 'Memorial', 'Adoption'];

export default function StartPage() {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState('');

  const [uploading, setUploading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    purpose: '', // dropdown
    campaign_name: '',
    beneficiary: '',
    goal_usd: '',
    start_et: '',            // optional; defaults to ASAP (~4 hours)
    end_et: '',              // datetime-local
    state_exclusions: 'Exclude NY, FL, RI',
    winner_share_pct: WINNER_SHARE_PCT,
    price_per_entry: PRICE_PER_ENTRY,
    entry_cap_total: ENTRY_CAP_TOTAL,
    amoe_address: AMOE_ADDRESS,
    amoe_pacing: AMOE_PACING,
    photo_url: '', // set after upload
    story_short: '',
    confirm_agree_rules_pricing: false,
    company: '' // honeypot
  });

  function update(k, v) { setForm(prev => ({ ...prev, [k]: v })); }

  function next() {
    setErr('');
    if (step === 1) {
      if (!form.full_name || !form.email || !form.purpose) {
        return setErr('Please fill all required fields.');
      }
    }
    if (step === 2) {
      const required = ['campaign_name','beneficiary','end_et']; // end time required
      for (const k of required) if (!form[k]) return setErr('Please fill all required fields.');
    }
    setStep(s => Math.min(3, s + 1));
  }

  function back() { setErr(''); setStep(s => Math.max(1,  - 1)); }

  async function handleUpload(file) {
    setErr('');
    if (!file) return;
    if (!file.type?.startsWith('image/')) {
      setErr('Please choose an image file (JPG/PNG/WebP).');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setErr('Please upload an image under 8 MB.');
      return;
    }

    try {
      setUploading(true);

      // Local preview
      const localUrl = URL.createObjectURL(file);
      setPhotoPreview(localUrl);

      const fd = new FormData();
      fd.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: fd
      });

      const data = await res.json();
      if (!res.ok || !data.ok || !data.url) {
        throw new Error(data.error || 'Upload failed');
      }
      update('photo_url', data.url);
    } catch (e) {
      setErr(e?.message || 'Upload failed');
      setPhotoPreview(null);
      update('photo_url', '');
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErr('');

    if (!form.confirm_agree_rules_pricing) {
      return setErr('Please confirm that you agree to the Official Rules & Pricing.');
    }
    if (!form.photo_url) {
      return setErr('Please upload a campaign photo.');
    }
    if (form.company) return; // honeypot

    // If start_et is blank, use a friendly default
    const startValue = form.start_et?.trim() ? form.start_et : 'ASAP (~4 hours)';

    setSubmitting(true);
    try {
      const payload = {
        // user-provided
        full_name: form.full_name,
        email: form.email,
        phone: form.phone || null,
        purpose: form.purpose,
        campaign_name: form.campaign_name,
        beneficiary: form.beneficiary,
        goal_usd: form.goal_usd ? Number(form.goal_usd) : null,
        start_et: startValue,
        end_et: form.end_et, // datetime-local string
        state_exclusions: form.state_exclusions,
        photo_url: form.photo_url,
        story_short: form.story_short || null,
        // selected + fixed values
        winner_share_pct: Number(form.winner_share_pct),
        price_per_entry: PRICE_PER_ENTRY,
        entry_cap_total: ENTRY_CAP_TOTAL,
        amoe_address: AMOE_ADDRESS,
        amoe_pacing: AMOE_PACING,
        packs_displayed: PACKS,
        source: 'start-page'
      };

      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Submission failed');
      setOk(true);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (ok) {
    return (
      <main className="page">
        <header className="nav">
          <div className="navInner">
            <Link className="brand" href="/"><span className="logo">★</span> KindDraw</Link>
          </div>
        </header>
        <section className="hero">
          <div className="heroInner thanks">
            <h1>You're in! 🎉</h1>
            <p>We’ve received your campaign details. Check your email for a confirmation and a link to review your Official Rules draft.</p>
            <Link className="btn btnDark" href="/">Back to home</Link>
          </div>
        </section>
        <style jsx>{styles}</style>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="nav">
        <div className="navInner">
          <Link className="brand" href="/"><span className="logo">★</span> KindDraw</Link>
        </div>
      </header>

      <section className="hero">
        <div className="heroInner">
          <div className="heroCopy">
            <h1>Start your campaign</h1>
            <p className="lead">
              Run a legal, transparent cash sweepstakes for your cause. Supporters can buy entries —or enter free by mail—with equal odds.
            </p>
            <p className="tiny muted">No purchase necessary. A purchase will not increase chances of winning. US 18+. Void where prohibited.</p>
          </div>

          <aside className="formCard" aria-label="Start a campaign">
            <form onSubmit={handleSubmit}>
              {/* Honeypot */}
              <input
                type="text"
                name="company"
                autoComplete="off"
                value={form.company}
                onChange={(e)=>update('company', e.target.value)}
                className="hp"
                tabIndex={-1}
                aria-hidden
              />

              <div className="stepsRow">
                <div className={`chip ${step===1?'active':''}`}>1. Your details</div>
                <div className={`chip ${step===2?'active':''}`}>2. Campaign setup</div>
                <div className={`chip ${step===3?'active':''}`}>3. Brand & submit</div>
              </div>

              {step === 1 && (
                <div className="grid">
                  <label> Your name
                    <input required type="text" value={form.full_name} onChange={e=>update('full_name', e.target.value)} placeholder="Jane Doe"/>
                  </label>
                  <label> Email
                    <input required type="email" value={form.email} onChange={e=>update('email', e.target.value)} placeholder="you@example.com"/>
                  </label>
                  <label> Phone (optional)
                    <input type="tel" value={form.phone} onChange={e=>update('phone', e.target.value)} placeholder="(555) 555-1212"/>
                  </label>

                  {/* Required dropdown */}
                  <label> What are you raising money for?
                    <select
                      required
                      value={form.purpose}
                      onChange={(e)=>update('purpose', e.target.value)}
                    >
                      <option value="" disabled>Choose a category…</option>
                      {PURPOSE_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              {step === 2 && (
                <div className="grid">
                  <label> Campaign name
                    <input required type="text" value={form.campaign_name} onChange={e=>update('campaign_name', e.target.value)} placeholder="Help the Parkers’ Travel Team"/>
                  </label>
                  <label> Beneficiary
                    <input required type="text" value={form.beneficiary} onChange={e=>update('beneficiary', e.target.value)} placeholder="Parker Family"/>
                  </label>
                  <label> Goal (optional)
                    <input type="number" min="0" step="1" value={form.goal_usd} onChange={e=>update('goal_usd', e.target.value)} placeholder="10000"/>
                  </label>

                  {/* Winner share: dropdown 25–50 by 5 */}
                  <label> Winner share
                    <select
                      required
                      value={form.winner_share_pct}
                      onChange={(e)=>update('winner_share_pct', Number(e.target.value))}
                    >
                      {[25,30,35,40,45,50].map(v => (
                        <option key={v} value={v}>{v}%</option>
                      ))}
                    </select>
                  </label>

                  {/* START TIME: fixed helper instead of picker */}
                  <div className="helpBox">
                    <div className="helpTitle">Start time</div>
                    <div className="tiny muted">
                      Most campaigns start within <strong>~4 hours</strong> of approval. If you need a specific start time, you can tell us later.
                    </div>
                  </div>

                  {/* END TIME: calendar + time */}
                  <label> End date & time (ET)
                    <input
                      required
                      type="datetime-local"
                      value={form.end_et}
                      onChange={(e)=>update('end_et', e.target.value)}
                    />
                    <span className="tiny muted">Select a date and time in Eastern Time.</span>
                  </label>

                  {/* Fixed settings (read-only) */}
                  <label> Price per entry
                    <input readOnly className="readonly" value={`$ ${PRICE_PER_ENTRY.toFixed(2)}`} />
                  </label>

                  <label> Entry tiers
                    <textarea
                      readOnly
                      className="readonly"
                      rows={5}
                      value={PACKS.map(p => `$${p.price} = ${p.entries} Entries`).join('\n')}
                    />
                  </label>

                  <label> Per-person cap
                    <input readOnly className="readonly" value={`${ENTRY_CAP_TOTAL} entries`} />
                  </label>

                  <label> AMOE pacing
                    <input readOnly className="readonly" value={AMOE_PACING} />
                  </label>

                  <label> AMOE address
                    <textarea
                      readOnly
                      className="readonly"
                      rows={3}
                      value={AMOE_ADDRESS}
                    />
                  </label>

                  {/* Keep state exclusions editable if you want to support filing */}
                  <label> State exclusions (optional)
                    <select value={form.state_exclusions} onChange={e=>update('state_exclusions', e.target.value)}>
                      <option>Exclude NY, FL, RI</option>
                      <option>Include all (I’ll file if required)</option>
                    </select>
                  </label>
                </div>
              )}

              {step === 3 && (
                <div className="grid">
                  {/* Campaign photo upload */}
                  <label> Campaign photo
                    <div className="uploadRow">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e)=>handleUpload(e.target.files?.[0])}
                      />
                      {uploading && <span className="tiny muted">Uploading…</span>}
                    </div>
                    {photoPreview && (
                      <div className="preview">
                        <img src={photoPreview} alt="Campaign preview" />
                      </div>
                    )}
                    {form.photo_url && !photoPreview && (
                      <div className="preview">
                        <img src={form.photo_url} alt="Campaign preview" />
                      </div>
                    )}
                  </label>

                  <label> Tell Your Story (optional)
                    <textarea rows={4} value={form.story_short} onChange={e=>update('story_short', e.target.value)} placeholder="Public story about the cause." />
                  </label>

                  <label className="check" htmlFor="agree">
                    <input
                      id="agree"
                      type="checkbox"
                      checked={form.confirm_agree_rules_pricing}
                      onChange={(e)=>update('confirm_agree_rules_pricing', e.target.checked)}
                    />
                    <span>I am 18+ and agree to the Official Rules & Pricing.</span>
                  </label>
                </div>
              )}

              {err && <p className="err">⚠ {err}</p>}

              <div className="actions">
                {step > 1 && <button type="button" className="btn" onClick={back}>Back</button>}
                {step < 3 && <button type="button" className="btn btnDark" onClick={next}>Continue</button>}
                {step === 3 && (
                  <button disabled={submitting || uploading} className="btn btnGreen" type="submit">
                    {submitting ? 'Submitting…' : 'Submit for review'}
                  </button>
                )}
              </div>

              <p className="tiny muted">
                Simple pricing: <strong>10% all-in</strong> (standard US card processing included). $199 minimum per campaign.
              </p>
            </form>
          </aside>
        </div>
      </section>

      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
:root{
  --ink:#0b1320; --muted:#6b7280; --line:#e5e7eb; --soft:#f7f8fb; --card:#fff;
  --green:#22c55e; --greenDark:#16a34a; --brand:#0f172a;
}
*{box-sizing:border-box}
body{margin:0;font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Helvetica,Arial;color:var(--ink)}
.nav{position:sticky;top:0;background:#fff;border-bottom:1px solid var(--line);z-index:20}
.navInner{max-width:1100px;margin:0 auto;padding:10px 16px;display:flex;align-items:center;gap:16px}
.brand{display:flex;align-items:center;gap:8px;font-weight:800;text-decoration:none;color:var(--ink)}
.logo{display:inline-flex;width:22px;height:22px;align-items:center;justify-content:center;background:var(--green);color:#fff;border-radius:6px;font-size:14px}
.hero{background:linear-gradient(180deg,#ffffff,#f7f8fb);border-bottom:1px solid var(--line)}
.heroInner{max-width:1100px;margin:0 auto;display:grid;grid-template-columns:1fr;gap:20px;padding:26px 16px}
@media(min-width:1000px){.heroInner{grid-template-columns:1.1fr .9fr}}
.heroCopy h1{font-size:32px;line-height:1.1;margin:6px 0 10px}
.lead{font-size:16px;line-height:1.6;color:#111;margin:0 0 10px}
.tiny{font-size:12px}
.muted{color:var(--muted)}
.legend{margin:0}
.formCard{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px;box-shadow:0 12px 30px rgba(2,6,23,.06)}
.formCard form{display:grid;gap:12px}
.grid{display:grid;gap:10px}
label{display:grid;gap:6px;font-weight:600}

/* Helper box for start time note */
.helpBox{
  border:1px dashed #e2e8f0;
  background:#f8fafc;
  border-radius:12px;
  padding:10px 12px;
}
.helpTitle{font-weight:700; font-size:13px; margin-bottom:4px}

/* Inputs (including read-only) */
input:not([type="checkbox"]), select, textarea{
  appearance:none;
  border:1px solid var(--line);
  border-radius:10px;
  padding:10px 12px;
  font-size:15px;
}
textarea{resize:vertical}

/* Read-only look */
input.readonly, textarea.readonly{
  background:#fafbff;
  color:var(--ink);
  border:1px solid var(--line);
  border-radius:10px;
  cursor:default;
}
input.readonly:focus, textarea.readonly:focus{ outline:none; box-shadow:none; }

/* Checkbox styling */
.check{display:flex;align-items:center;gap:10px;font-weight:500;cursor:pointer}
.check input{
  appearance:auto;
  accent-color: var(--green);
  width:18px;
  height:18px;
  margin:0;
  cursor:pointer;
}
.check span{cursor:pointer}

/* Upload */
.uploadRow{display:flex;gap:10px;align-items:center}
.preview{margin-top:8px}
.preview img{max-width:100%;height:auto;border-radius:12px;border:1px solid var(--line)}
.btn{display:inline-block;padding:10px 14px;border-radius:10px;border:1px solid var(--line);font-weight:800;text-decoration:none;text-align:center;background:#fff}
.btnDark{background:var(--brand);color:#fff;border-color:var(--brand)}
.btnGreen{background:var(--green);color:#fff;border-color:var(--green)}
.btnGreen:hover{background:var(--greenDark)}
.err{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:8px 10px;border-radius:8px}
.stepsRow{display:flex;gap:8px;flex-wrap:wrap}
.chip{border:1px solid var(--line);padding:6px 10px;border-radius:999px;font-weight:700;color:var(--muted)}
.chip.active{border-color:#cbd5e1;color:#0f172a;background:#fff}
.actions{display:flex;gap:8px;align-items:center}
.hp{position:absolute;left:-9999px;top:-9999px}
.thanks{display:grid;gap:10px;padding:40px 16px}
`;
