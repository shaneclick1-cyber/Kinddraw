import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

// Set this to your bucket name in Supabase Storage
const BUCKET = 'campaign-photos';

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ ok: false, error: 'Missing file' }, { status: 400 });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ ok: false, error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Create a unique object key
    const ext = (file.name && file.name.includes('.')) ? file.name.split('.').pop() : 'jpg';
    const key = `uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await supabase
      .storage
      .from(BUCKET)
      .upload(key, bytes, {
        contentType: file.type || 'image/jpeg',
        upsert: false
      });

    if (uploadError) {
      return NextResponse.json({ ok: false, error: uploadError.message }, { status: 500 });
    }

    // If the bucket is public, getPublicUrl returns a usable URL.
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(key);

    if (!pub?.publicUrl) {
      return NextResponse.json({ ok: false, error: 'Could not get public URL' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, url: pub.publicUrl });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
