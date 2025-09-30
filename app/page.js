'use client';
import Link from 'next/link';

export default function Home() {
  return (
    <main style={{fontFamily:'ui-sans-serif, system-ui', padding:'32px'}}>
      <header style={{marginBottom:16}}>
        <Link href="/" className="brand"><span style={{background:'#22c55e',color:'#fff',borderRadius:6,padding:'4px 8px',marginRight:8}}>★</span>KindDraw</Link>
      </header>
      <h1 style={{margin:'12px 0'}}>Start a fundraiser with a prize—legal & transparent</h1>
      <p>Supporters can buy entry packs—or enter free by mail—with equal odds.</p>
      <p style={{fontSize:12,color:'#6b7280'}}>No purchase necessary. US 18+. Void where prohibited.</p>
    </main>
  );
}
