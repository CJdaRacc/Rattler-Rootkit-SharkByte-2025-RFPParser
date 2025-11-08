import React, { useEffect, useState } from 'react';
import axios from 'axios';

export default function Proposals() {
  const [rfps, setRfps] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [rfpId, setRfpId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [name, setName] = useState('My Proposal Draft');
  const [msg, setMsg] = useState('');
  const [current, setCurrent] = useState(null);
  const [sections, setSections] = useState([]);

  async function refresh() {
    const [rfpRes, tplRes, propRes] = await Promise.all([
      axios.get('/api/rfps'),
      axios.get('/api/templates'),
      axios.get('/api/proposals'),
    ]);
    setRfps(rfpRes.data);
    setTemplates(tplRes.data);
    setProposals(propRes.data);
  }

  async function generate() {
    if (!rfpId || !templateId) {
      setMsg('Select an RFP and a Template');
      return;
    }
    setMsg('Generating draft...');
    try {
      const { data } = await axios.post('/api/proposals/generate', { rfpId, templateId, name });
      setMsg('Draft created');
      setCurrent(data.proposal);
      setSections(data.sections);
      await refresh();
    } catch (e) {
      setMsg('Error: ' + (e.response?.data?.error || e.message));
    }
  }

  async function openProposal(p) {
    setCurrent(p);
    const { data } = await axios.get(`/api/proposals/${p._id}/sections`);
    setSections(data);
  }

  async function exportMd() {
    if (!current) return;
    setMsg('Exporting Markdown...');
    try {
      const { data } = await axios.get(`/api/proposals/${current._id}/export`);
      setMsg('Exported to: ' + data.path);
    } catch (e) {
      setMsg('Export failed: ' + (e.response?.data?.error || e.message));
    }
  }

  useEffect(() => { refresh(); }, []);

  return (
    <div>
      <h3>Proposals</h3>
      <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
        <select value={rfpId} onChange={(e)=>setRfpId(e.target.value)}>
          <option value="">Select RFP</option>
          {rfps.map((r)=> <option key={r._id} value={r._id}>{r.name}</option>)}
        </select>
        <select value={templateId} onChange={(e)=>setTemplateId(e.target.value)}>
          <option value="">Select Template</option>
          {templates.map((t)=> <option key={t._id} value={t._id}>{t.name}</option>)}
        </select>
        <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Proposal name" />
        <button onClick={generate}>Generate Draft</button>
        <span>{msg}</span>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'280px 1fr', gap:16, marginTop:16 }}>
        <div>
          <h4>Existing Drafts</h4>
          <ul>
            {proposals.map((p)=> (
              <li key={p._id}>
                <button onClick={()=>openProposal(p)} style={{ marginRight:8 }}>Open</button>
                {p.name || 'Draft'} · {new Date(p.createdAt).toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
        <div>
          {current ? (
            <div>
              <h4>{current.name}</h4>
              <button onClick={exportMd}>Export Markdown</button>
              {sections.map((s)=> (
                <section key={s._id} style={{ marginTop:16, padding:'12px 16px', border:'1px solid #ddd', borderRadius:6 }}>
                  <h5 style={{ margin:'4px 0' }}>{s.title}</h5>
                  <div style={{ fontSize:12, color:'#666' }}>Coverage: {s.coverage?.length || 0} requirement(s)</div>
                  <pre style={{ whiteSpace:'pre-wrap' }}>{s.mdBody}</pre>
                </section>
              ))}
            </div>
          ) : (
            <div style={{ color:'#666' }}>Select an RFP and a Template to generate a draft, or open an existing draft.</div>
          )}
        </div>
      </div>
    </div>
  );
}
