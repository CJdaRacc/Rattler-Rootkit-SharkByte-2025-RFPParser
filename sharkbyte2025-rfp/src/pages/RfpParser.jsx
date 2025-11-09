import { useEffect, useMemo, useState } from 'react';
import { api, uploadFile } from '../lib/api.js';
import TipCarousel from '../components/TipCarousel.jsx';

export default function RfpParser(){
  const tips = useMemo(() => [
    'Define Needs, Not Solutions: State what you need (e.g., "17 workflows across 3 workstreams") but avoid prescribing the exact technical solution.',
    'Include Flow Documentation: Add future-state flows if available to give vendors a clear visual roadmap.',
    'Specify Mandatory M&O Periods: If a fixed Maintenance & Operations period is required after go-live, mark it as mandatory.',
    'List Allocated Resources: List internal resources by role and allocation percentage to set delivery expectations.',
    'Be Specific or Estimate: Be exact (e.g., "10 permission sets") or provide a confident range (e.g., "10–15").',
    'Detail Data Needs: Outline migration/conversion scope and whether cleansing or mapping is already complete.',
    'Keep SLAs Reasonable: Avoid unrealistic SLAs (e.g., 100% uptime with penalties) that deter quality vendors.',
    'Ensure Testability: Write requirements so they are testable to prevent scope padding and ambiguity.',
    'Mandate and Answer Q&A: Run a written Q&A and answer every question—even if the answer is an estimate or "We don’t know yet."',
    'State Delivery Model Preference: If onshore or a specific model is required, state it clearly and in multiple sections.',
    'Ignore Team Resumes: Don’t require exact named resumes for the delivery team; request representative profiles instead.',
    'Avoid the Lowest Bid Trap: The lowest bid can cost more via change orders and quality issues—opt for value, not just price.'
  ], []);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [rfp, setRfp] = useState(null); // full RFP doc from server
  // Auto-keywords: no user input required
  const [suggestions, setSuggestions] = useState({});
  const [error, setError] = useState('');

  async function onUpload(e){
    e.preventDefault();
    if (!file) return;
    setUploading(true); setError('');
    try {
      const created = await uploadFile('/api/rfps', file);
      setRfp(created);
      setSuggestions({});
    } catch (e) { setError(e.message); }
    finally { setUploading(false); }
  }

  async function autoKeywords(){
    if (!rfp?._id) return;
    try {
      const data = await api(`/api/rfps/${rfp._id}/auto-keywords`, { method: 'POST' });
      setRfp(data.rfp);
    } catch (e) { setError(e.message); }
  }

  async function loadSuggestions(){
    if (!rfp?._id) return;
    try {
      const data = await api(`/api/rfps/${rfp._id}/suggestions`, { method: 'POST' });
      setSuggestions(data.suggestions || {});
    } catch (e) { setError(e.message); }
  }

  const keywords = rfp?.keywords || [];
  const missing = rfp?.missingItems || [];

  return (
    <div>
      {error && <div className="status" style={{color:'#b91c1c'}}>{error}</div>}

      <div className="card">
        <h2>Upload RFP</h2>
        <form onSubmit={onUpload}>
          <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={e=>setFile(e.target.files?.[0]||null)} />
          <div className="actions" style={{marginTop:8}}>
            <button type="submit" disabled={!file || uploading}>{uploading ? 'Uploading...' : 'Upload & Analyze'}</button>
          </div>
        </form>
      </div>

      {rfp && (
        <>
          <div className="card">
            <div className="status">
              <strong>File:</strong> {rfp.original_filename} <em>({rfp.docType})</em> · <strong>Accuracy:</strong> {rfp.accuracy || 0}% · <strong>Missing:</strong> {missing.join(', ') || '—'}
            </div>
          </div>

          <div className="card">
            <h3>Suggested Keywords</h3>
            <p className="status">No input needed — we’ll infer keywords from your RFP’s overview/summary/goals and public context.</p>
            <button onClick={autoKeywords} disabled={!rfp?._id} style={{marginTop:8}}>Suggest Keywords (Auto)</button>
            <div className="pillbox" style={{marginTop:10}}>
              {keywords.map(k => <span key={k} className="pill">{k}</span>)}
            </div>
          </div>

          <div className="card">
            <h2>Parsed Requirements</h2>
            <div className="requirements">
              {(rfp.parsedRequirements||[]).map(req => (
                <div key={req.id} className="req-item">
                  <div className="req-head">
                    <span className="req-id">{req.id}</span>
                    <span className="req-title">{req.title}</span>
                    <span className="req-cat">{req.category}</span>
                    <span className={`req-prio prio-${req.priority}`}>{req.priority}</span>
                  </div>
                  <div className="req-body">
                    <div className="snippet">{highlight(req.text_snippet || '', keywords)}</div>
                    <div><strong>Due:</strong> {(req.due_dates||[]).join('; ')||'—'}</div>
                    <div><strong>Evidence:</strong> {(req.evidence_required||[]).join(', ')||'—'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3>Missing Items</h3>
            {(missing.length === 0) ? <div>None 🎉</div> : (
              <>
                <ul>
                  {missing.map(m => (
                    <li key={m} style={{marginBottom:12}}>
                      <div style={{display:'flex', alignItems:'baseline', gap:8}}>
                        <strong style={{minWidth:180}}>{m}:</strong>
                        {renderSuggestionBlock(suggestions[m], rfp?.parsedRequirements || [])}
                      </div>
                    </li>
                  ))}
                </ul>
                <button onClick={loadSuggestions}>Get Suggestions (Gemini)</button>
              </>
            )}
          </div>
        </>
      )}
      <div className="card">
        <TipCarousel tips={tips} rotateMs={6000} lifetimeMs={90000} storageKey={null} variant="inline" />
      </div>
    </div>
  );
}

function highlight(text, kws){
  if (!text) return null;
  if (!kws || kws.length === 0) return <span>{text}</span>;
  const tokens = tokenizeForHighlight(text, kws);
  return <span>{tokens.map((t,i)=> t.mark ? <mark key={i} style={{background:'#fde68a'}}>{t.text}</mark> : <span key={i}>{t.text}</span>)}</span>;
}

function tokenizeForHighlight(text, kws){
  const ranges = [];
  const lower = text.toLowerCase();
  for (const k of kws){
    const term = String(k).toLowerCase();
    if (!term) continue;
    let idx = 0;
    while ((idx = lower.indexOf(term, idx)) !== -1){
      ranges.push([idx, idx + term.length]);
      idx += term.length;
    }
  }
  ranges.sort((a,b)=> a[0]-b[0] || a[1]-b[1]);
  // merge
  const merged=[];
  for (const r of ranges){
    if (!merged.length || r[0] > merged[merged.length-1][1]) merged.push(r);
    else merged[merged.length-1][1] = Math.max(merged[merged.length-1][1], r[1]);
  }
  const out=[];
  let pos=0;
  for (const [s,e] of merged){
    if (pos < s) out.push({ text: text.slice(pos, s) });
    out.push({ text: text.slice(s, e), mark: true });
    pos = e;
  }
  if (pos < text.length) out.push({ text: text.slice(pos) });
  return out;
}


// Helper to render a rich suggestion block that is document-specific
function renderSuggestionBlock(s, parsedReqs){
  if (!s) return <div style={{fontSize:13, color:'#334155'}}>—</div>;
  // Backward compatibility: if suggestion is a simple string
  if (typeof s === 'string') return <div style={{fontSize:13, color:'#334155'}}>{s}</div>;

  const rel = Array.isArray(s.related_requirements) ? s.related_requirements : [];
  const reqMap = new Map((parsedReqs||[]).map(r => [String(r.id), r]));

  return (
    <div style={{display:'grid', gap:6, flex:1}}>
      {s.summary && (
        <div style={{fontSize:13, color:'#334155'}}>{s.summary}</div>
      )}
      {Array.isArray(s.actions) && s.actions.length > 0 && (
        <ul style={{margin:0, paddingLeft:18, color:'#0f172a'}}>
          {s.actions.map((a,i) => <li key={i} style={{fontSize:13}}>{a}</li>)}
        </ul>
      )}
      {rel.length > 0 && (
        <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
          <span style={{fontSize:12, color:'#64748b'}}>Related in your RFP:</span>
          {rel.map((r,i) => {
            const full = reqMap.get(String(r.id));
            const label = String(r.id);
            const sub = full?.text_snippet || '';
            const due = r.due_date || (full?.due_dates && full.due_dates[0]) || '';
            const ev = r.evidence || (full?.evidence_required && full.evidence_required[0]) || '';
            const title = [full?.title, due && `Due: ${due}`, ev && `Evidence: ${ev}`].filter(Boolean).join(' • ');
            return (
              <span key={i} title={title} style={{background:'#eef2ff', color:'#1e293b', padding:'2px 8px', borderRadius:999, fontSize:12}}>
                {label}
              </span>
            );
          })}
        </div>
      )}
      {typeof s.confidence === 'number' && (
        <div style={{fontSize:11, color:'#64748b'}}>Confidence: {(Math.round(s.confidence * 100))}%</div>
      )}
    </div>
  );
}
