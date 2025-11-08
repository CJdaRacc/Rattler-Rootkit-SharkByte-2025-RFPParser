import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export default function Profile({ me, setMe }){
  const [tags, setTags] = useState(me?.tags || []);
  const [businesses, setBusinesses] = useState(me?.businesses || []);
  const [companyName, setCompanyName] = useState(me?.companyName || '');
  const [name, setName] = useState(me?.name || '');
  const [rfps, setRfps] = useState([]);
  const [newTag, setNewTag] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setTags(me?.tags || []); setBusinesses(me?.businesses || []); setCompanyName(me?.companyName || ''); setName(me?.name || ''); }, [me]);
  useEffect(() => { (async () => { try { const list = await api('/api/rfps'); setRfps(list); } catch {} })(); }, []);

  async function saveProfile(){
    setSaving(true); setError('');
    try {
      const updated = await api('/api/me', { method: 'PUT', body: { name, companyName, tags, businesses } });
      setMe && setMe(updated);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  function addTag(){
    const t = newTag.trim();
    if (!t) return;
    if (tags.includes(t)) return;
    setTags([...tags, t]);
    setNewTag('');
  }

  function removeTag(t){ setTags(tags.filter(x => x !== t)); }

  function addBusiness(){ setBusinesses([...businesses, { name: '' }]); }
  function updateBusiness(i, field, value){
    const next = businesses.slice();
    next[i] = { ...next[i], [field]: value };
    setBusinesses(next);
  }
  function removeBusiness(i){ setBusinesses(businesses.filter((_, idx) => idx !== i)); }

  async function saveRfpTags(rfpId, tags){
    try {
      const updated = await api(`/api/rfps/${rfpId}/tags`, { method: 'PUT', body: { tags } });
      setRfps(rfps.map(r => r._id === rfpId ? updated : r));
    } catch {}
  }

  return (
    <div className="min-h-[70vh] flex justify-center">
      <div className="w-full max-w-6xl mx-auto px-4">
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-1">Profile</h2>
        <div style={{color:'#475569'}}>{name}</div>
        <div style={{color:'#64748b', marginBottom:12}}>{companyName}</div>

        {error && <div style={{color:'#b91c1c'}}>{error}</div>}

        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>
          <section>
            <h3>Tags</h3>
            <div style={{display:'flex', gap:8, marginBottom:8}}>
              <input type="text" value={newTag} onChange={e=>setNewTag(e.target.value)} placeholder="Add tag" />
              <button onClick={addTag}>Add</button>
            </div>
            <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
              {tags.map(t => (
                <span key={t} style={{background:'#e2e8f0', padding:'4px 8px', borderRadius:999}}>
                  {t} <button onClick={()=>removeTag(t)} title="Remove" style={{marginLeft:6}}>×</button>
                </span>
              ))}
            </div>
          </section>
          <section>
            <h3>Past RFPs</h3>
            <ul style={{paddingLeft:18}}>
              {rfps.map(r => (
                <li key={r._id}>
                  <div><strong>{r.original_filename}</strong> — <em>{r.docType}</em> — Accuracy: {r.accuracy || 0}%</div>
                  <div style={{fontSize:12, color:'#64748b'}}>Missing: {(r.missingItems||[]).join(', ') || '—'}</div>
                  <div style={{display:'flex', gap:6, flexWrap:'wrap', marginTop:6}}>
                    {(r.tags||[]).map(t => <span key={t} style={{background:'#f1f5f9', padding:'2px 6px', borderRadius:6}}>{t}</span>)}
                  </div>
                  <TagEditor initial={r.tags||[]} onSave={(tags)=>saveRfpTags(r._id, tags)} />
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section style={{marginTop:16}}>
          <h3>Businesses (optional)</h3>
          <button onClick={addBusiness}>Add Business</button>
          {businesses.map((b, i) => (
            <div key={i} style={{border:'1px solid #e2e8f0', borderRadius:8, padding:8, marginTop:8}}>
              <label>Name<input type="text" value={b.name||''} onChange={e=>updateBusiness(i,'name',e.target.value)} /></label>
              <label>EIN<input type="text" value={b.ein||''} onChange={e=>updateBusiness(i,'ein',e.target.value)} /></label>
              <label>Notes<input type="text" value={b.notes||''} onChange={e=>updateBusiness(i,'notes',e.target.value)} /></label>
              <button onClick={()=>removeBusiness(i)}>Remove</button>
            </div>
          ))}
        </section>

        <div style={{marginTop:16}}>
          <button onClick={saveProfile} disabled={saving}>{saving?'Saving...':'Save Profile'}</button>
        </div>
      </div>
    </div>
  );
}

function TagEditor({ initial, onSave }){
  const [list, setList] = useState(initial);
  const [input, setInput] = useState('');
  useEffect(()=>setList(initial), [initial]);
  function add(){ const v=input.trim(); if(!v) return; if(list.includes(v)) return; setList([...list, v]); setInput(''); }
  function remove(t){ setList(list.filter(x=>x!==t)); }
  return (
    <div style={{marginTop:6}}>
      <div style={{display:'flex', gap:6}}>
        <input value={input} onChange={e=>setInput(e.target.value)} placeholder="Add tag to RFP" />
        <button onClick={add}>Add</button>
        <button onClick={()=>onSave(list)}>Save Tags</button>
      </div>
      <div style={{display:'flex', gap:6, flexWrap:'wrap', marginTop:6}}>
        {list.map(t => <span key={t} style={{background:'#eef2ff', padding:'2px 6px', borderRadius:6}}>{t} <button onClick={()=>remove(t)}>×</button></span>)}
      </div>
    </div>
  );
}
