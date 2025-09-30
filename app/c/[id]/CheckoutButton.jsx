'use client';

import { useState } from 'react';

export default function CheckoutButton({ campaignId, packPrice, packEntries }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  async function handleClick() {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, packPrice, packEntries }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to create checkout session');
      window.location.href = json.url; // redirect to Stripe Checkout
    } catch (e) {
      setErr(e.message || 'Checkout failed');
      setLoading(false);
    }
  }

  return (
    <>
      <button className="btn btnDark" onClick={handleClick} disabled={loading}>
        {loading ? 'Redirecting…' : 'Buy'}
      </button>
      {err && <div className="tiny muted" style={{ marginTop: 6 }}>⚠ {err}</div>}
    </>
  );
}

