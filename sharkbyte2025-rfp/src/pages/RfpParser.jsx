import { useEffect, useMemo, useState } from 'react';
import { api, uploadFile } from '../lib/api.js';

export default function RfpParser(){
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [rfp, setRfp] = useState(null); // full RFP doc from server
  const [projectGoal, setProjectGoal] = useState('');
  const [summary, setSummary] = useState('');
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

  async function generateKeywords(){
    if (!rfp?._id) return;
    try {
      const data = await api(`/api/rfps/${rfp._id}/keywords`, { method: 'POST', body: { projectGoal, summary } });
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
      <h2>RFP Parser</h2>
      {error && <div style={{color:'#b91c1c', marginBottom:8}}>{error}</div>}

      <form onSubmit={onUpload} style={{display:'flex', gap:8, alignItems:'center'}}>
        <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={e=>setFile(e.target.files?.[0]||null)} />
        <button type="submit" disabled={!file || uploading}>{uploading ? 'Uploading...' : 'Upload & Analyze'}</button>
      </form>

      {rfp && (
        <div style={{marginTop:16}}>
          <div style={{display:'flex', gap:16, alignItems:'center', flexWrap:'wrap'}}>
            <div><strong>File:</strong> {rfp.original_filename} <em>({rfp.docType})</em></div>
            <div><strong>Accuracy:</strong> {rfp.accuracy || 0}%</div>
            <div><strong>Missing:</strong> {missing.join(', ') || '—'}</div>
          </div>

          <section style={{marginTop:12}}>
            <h3>Project Context for Keywords</h3>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
              <label>Project Goal<textarea rows={4} value={projectGoal} onChange={e=>setProjectGoal(e.target.value)} /></label>
              <label>Summary<textarea rows={4} value={summary} onChange={e=>setSummary(e.target.value)} /></label>
            </div>
            <button onClick={generateKeywords} style={{marginTop:8}}>Generate Keywords (Gemini)</button>
            <div style={{display:'flex', gap:6, flexWrap:'wrap', marginTop:8}}>
              {keywords.map(k => <span key={k} style={{background:'#0ea5e9', color:'#fff', padding:'4px 8px', borderRadius:999, fontSize:12}}>{k}</span>)}
            </div>
          </section>

          <section style={{marginTop:16, display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
            <div>
              <h3>Parsed Requirements</h3>
              <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))', gap:8}}>
                {(rfp.parsedRequirements||[]).map(req => (
                  <div key={req.id} style={{border:'1px solid #e2e8f0', borderRadius:8, padding:8}}>
                    <div style={{display:'flex', gap:6, alignItems:'center', marginBottom:6, flexWrap:'wrap'}}>
                      <span style={{fontWeight:600}}>{req.id}</span>
                      <span style={{fontWeight:600, flex:1}}>{req.title}</span>
                      <span style={{background:'#e2e8f0', borderRadius:6, padding:'2px 6px'}}>{req.category}</span>
                      <span className={`prio-${req.priority}`} style={{color:'#fff', borderRadius:6, padding:'2px 6px', background: req.priority==='high'?'#ef4444':req.priority==='medium'?'#f59e0b':'#10b981'}}>{req.priority}</span>
                    </div>
                    <div style={{fontSize:13, color:'#334155'}}>
                      {highlight(req.text_snippet || '', keywords)}
                    </div>
                    <div style={{fontSize:12, color:'#64748b', marginTop:6}}><strong>Due:</strong> {(req.due_dates||[]).join('; ')||'—'}</div>
                    <div style={{fontSize:12, color:'#64748b'}}><strong>Evidence:</strong> {(req.evidence_required||[]).join(', ')||'—'}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3>Missing Items</h3>
              {(missing.length === 0) ? <div>None 🎉</div> : (
                <>
                  <ul>
                    {missing.map(m => (
                      <li key={m} style={{marginBottom:8}}>
                        <strong>{m}:</strong>
                        <div style={{fontSize:13, color:'#334155'}}>{suggestions[m] || '—'}</div>
                      </li>
                    ))}
                  </ul>
                  <button onClick={loadSuggestions}>Get Suggestions (Gemini)</button>
                </>
              )}
            </div>
          </section>
        </div>
      )}
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
