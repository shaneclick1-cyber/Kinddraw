'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

export default function CommentsClient({
  campaignId,
  supabaseUrl,
  supabaseAnonKey,
}) {
  // Fallback to NEXT_PUBLIC_* if not passed as props
  const url = supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = supabaseAnonKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const [displayName, setDisplayName] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [comments, setComments] = useState([]);

  const configured = Boolean(url && anon);
  const supabase = useMemo(() => (configured ? createClient(url, anon) : null), [configured, url, anon]);

  function fmtLocal(isoString) {
    // Stable *local* formatting, includes timezone abbreviation (e.g., EDT)
    try {
      const d = new Date(isoString);
      return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short', // shows local tz like EDT/PDT
      }).format(d);
    } catch {
      return isoString;
    }
  }

  async function fetchComments() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('comments')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false });
    if (error) setErr(error.message);
    else setComments(data || []);
  }

  useEffect(() => {
    fetchComments();
    if (!supabase) return;
    const channel = supabase
      .channel('comments-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comments', filter: `campaign_id=eq.${campaignId}` },
        (payload) => setComments((prev) => [payload.new, ...prev])
      )
      .subscribe();
    return () => { channel.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, supabase]);

  async function submitComment(e) {
    e.preventDefault();
    setErr('');
    if (!displayName.trim() || !body.trim()) {
      setErr('Please enter your name and a comment.');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('comments')
        .insert([{ campaign_id: campaignId, display_name: displayName.trim(), body: body.trim() }]);
      if (error) throw error;
      setDisplayName('');
      setBody('');
    } catch (e) {
      setErr(e.message || 'Failed to post comment.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="comments">
      <h2>Comments</h2>

      {!configured && (
        <p className="tiny muted">⚠ Supabase is not configured.</p>
      )}

      {configured && (
        <>
          <form onSubmit={submitComment} className="commentForm">
            <input
              type="text"
              placeholder="Your name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="input"
            />
            <textarea
              rows={3}
              placeholder="Say something nice…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="textarea"
            />
            {err && <p className="err">⚠ {err}</p>}
            <div className="actions">
              <button className="btn btnDark" disabled={submitting} type="submit">
                {submitting ? 'Posting…' : 'Post comment'}
              </button>
            </div>
          </form>

          <ul className="commentList">
            {comments.map(c => (
              <li key={c.id} className="comment">
                <div className="who">{c.display_name}</div>
                <div className="what">{c.body}</div>
                {/* suppressHydrationWarning guards against any stray attrs/extensions */}
                <div className="when tiny muted" suppressHydrationWarning>
                  {fmtLocal(c.created_at)}
                </div>
              </li>
            ))}
            {comments.length === 0 && <li className="tiny muted">Be the first to comment.</li>}
          </ul>
        </>
      )}

      <style jsx>{`
        .comments{margin-top:16px}
        .commentForm{display:grid;gap:8px;margin-bottom:10px}
        .input,.textarea{
          appearance:none;border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;font-size:15px;
        }
        .textarea{resize:vertical}
        .actions{display:flex;gap:8px;align-items:center}
        .btn{display:inline-block;padding:10px 14px;border-radius:10px;border:1px solid #e5e7eb;font-weight:800;text-decoration:none;text-align:center;background:#fff}
        .btnDark{background:#0f172a;color:#fff;border-color:#0f172a}
        .err{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:8px 10px;border-radius:8px}
        .commentList{list-style:none;padding:0;margin:0;display:grid;gap:10px}
        .comment{border:1px solid #e5e7eb;border-radius:12px;padding:10px;background:#fff}
        .who{font-weight:800;margin-bottom:4px}
        .what{white-space:pre-wrap}
        .tiny{font-size:12px}
        .muted{color:#6b7280}
      `}</style>
    </section>
  );
}
