import React, { useEffect, useState } from 'react';
import axios from 'axios';

export default function UploadRfp() {
  const [file, setFile] = useState(null);
  const [rfps, setRfps] = useState([]);
  const [selected, setSelected] = useState(null);
  const [sections, setSections] = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function refreshRfps() {
    const { data } = await axios.get('/api/rfps');
    setRfps(data);
  }

  async function onUpload(e) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setMsg('Uploading and ingesting...');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const { data } = await axios.post('/api/rfps/ingest', fd);
      setMsg(`Ingested ${data.rfp?.name}. Sections: ${data.sectionsCount}, Requirements: ${data.requirementsCount}`);
      await refreshRfps();
    } catch (e) {
      setMsg('Upload failed: ' + (e.response?.data?.error || e.message));
    } finally {
      setBusy(false);
    }
  }

  async function selectRfp(id) {
    setSelected(id);
    const [secRes, reqRes] = await Promise.all([
      axios.get(`/api/rfps/${id}/sections`),
      axios.get(`/api/rfps/${id}/requirements`),
    ]);
    setSections(secRes.data);
    setRequirements(reqRes.data);
  }

  useEffect(() => { refreshRfps(); }, []);

  return (
    <div>
      <h3>Upload RFP</h3>
      <form onSubmit={onUpload} style={{ display:'flex', gap:8, alignItems:'center' }}>
        <input type="file" accept=".pdf,.docx,.txt" onChange={(e)=>setFile(e.target.files?.[0])} />
        <button disabled={!file || busy} type="submit">{busy ? 'Processing...' : 'Upload & Ingest'}</button>
        <span>{msg}</span>
      </form>

      <h3 style={{ marginTop: 24 }}>RFPs</h3>
      <ul>
        {rfps.map((r)=> (
          <li key={r._id}>
            <button onClick={()=>selectRfp(r._id)} style={{ marginRight: 8 }}>Open</button>
            {r.name} · {new Date(r.createdAt).toLocaleString()}
          </li>
        ))}
      </ul>

      {selected && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginTop: 16 }}>
          <div>
            <h4>Sections</h4>
            <ol>
              {sections.map((s)=> (
                <li key={s._id}>
                  <strong>{s.title}</strong>
                  <div style={{ whiteSpace:'pre-wrap', fontSize:12, color:'#333' }}>{(s.text||'').slice(0,400)}{(s.text||'').length>400?'...':''}</div>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h4>Extracted Requirements (stub)</h4>
            <ol>
              {requirements.map((rq)=> (
                <li key={rq._id}>
                  <strong>{rq.title}</strong>
                  <div>Category: {rq.category} · Priority: {rq.priority}</div>
                  <div style={{ whiteSpace:'pre-wrap', fontSize:12, color:'#333' }}>{rq.textSnippet}</div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
