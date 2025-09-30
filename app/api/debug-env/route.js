export async function GET() {
  const url = process.env.SUPABASE_URL || null;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null;
  return Response.json({
    ok: true,
    hasUrl: !!url,
    urlHost: url ? new URL(url).host : null,
    hasAnon: !!anon,
    anonLen: anon ? anon.length : 0,
    anonStartsWith: anon ? anon.slice(0, 20) : null,
    anonEndsWith: anon ? anon.slice(-6) : null,
  });
}
