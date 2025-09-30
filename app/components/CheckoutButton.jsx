'use client';

import { useState } from 'react';

export default function CheckoutButton({ campaignId, packPrice, packEntries }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    try {
      setLoading(true);
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, packPrice, packEntries }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Unknown error');
      if (data?.url) window.location.href = data.url;
    } catch (err) {
      alert(`Checkout failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button className="btn btnDark" onClick={handleClick} disabled={loading}>
      {loading ? 'Redirecting…' : 'Buy'}
    </button>
  );
}
