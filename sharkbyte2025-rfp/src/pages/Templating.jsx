import { useState } from 'react';
import { api } from '../lib/api.js';

export default function Templating(){
  const [ess, setEss] = useState({
    org_name: '', contact_name: '', email: '', phone: '', address: '', proposal_title: '',
    exec_summary: '', goals: '', scope: '', timeline: '', budget_total: '', budget_narrative: '',
    capacity: '', evaluation: '', outcomes: '', submission_format: '', due_dates: ''
  });
  const [draft, setDraft] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  function change(e){ setEss({ ...ess, [e.target.name]: e.target.value }); }

  async function generate(){
    setStatus('Generating via Gemini...'); setError('');
    try {
      const res = await api('/api/templates/generate', { method: 'POST', body: { essentials: ess } });
      setDraft(res.draft || {});
      setStatus('Draft generated.');
    } catch (e) { setError(e.message); setStatus(''); }
  }

  function updateDraft(path, value){
    setDraft(prev => setAtPath(prev || {}, path, value));
  }

  async function exportFile(format){
    try {
      setStatus(`Exporting ${format.toUpperCase()}...`);
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ format, title: ess.proposal_title || 'Proposal', content: draft || ess }),
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(ess.proposal_title||'proposal').replace(/[^a-z0-9_-]+/ig,'_')}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus('Export complete.');
    } catch (e) { setError(e.message); setStatus(''); }
  }

  return (
    <div>
      {error && <div className="status" style={{color:'#b91c1c'}}>{error}</div>}
      {status && <div className="status">{status}</div>}

      <div className="card">
        <h2>Proposal Essentials</h2>
        <fieldset>
          <legend>Cover Information</legend>
          <label>Organization Name<input type="text" name="org_name" value={ess.org_name} onChange={change} /></label>
          <label>Contact Name<input type="text" name="contact_name" value={ess.contact_name} onChange={change} /></label>
          <label>Email<input type="email" name="email" value={ess.email} onChange={change} /></label>
          <label>Phone<input type="tel" name="phone" value={ess.phone} onChange={change} /></label>
          <label>Address<input type="text" name="address" value={ess.address} onChange={change} /></label>
          <label>Proposal Title<input type="text" name="proposal_title" value={ess.proposal_title} onChange={change} /></label>
        </fieldset>
        <fieldset>
          <legend>Executive Summary</legend>
          <label>Summary<textarea name="exec_summary" rows={5} value={ess.exec_summary} onChange={change} /></label>
        </fieldset>
        <fieldset>
          <legend>Project Description</legend>
          <label>Goals & Objectives<textarea name="goals" rows={4} value={ess.goals} onChange={change} /></label>
          <label>Scope / Activities<textarea name="scope" rows={5} value={ess.scope} onChange={change} /></label>
          <label>Timeline<textarea name="timeline" rows={3} value={ess.timeline} onChange={change} /></label>
        </fieldset>
        <fieldset>
          <legend>Budget</legend>
          <label>Budget Total<input type="text" name="budget_total" value={ess.budget_total} onChange={change} placeholder="$" /></label>
          <label>Budget Narrative<textarea name="budget_narrative" rows={4} value={ess.budget_narrative} onChange={change} /></label>
        </fieldset>
        <fieldset>
          <legend>Organization & Evaluation</legend>
          <label>Organizational Capacity<textarea name="capacity" rows={4} value={ess.capacity} onChange={change} /></label>
          <label>Evaluation<textarea name="evaluation" rows={4} value={ess.evaluation} onChange={change} /></label>
          <label>Outcomes<textarea name="outcomes" rows={4} value={ess.outcomes} onChange={change} /></label>
        </fieldset>
        <fieldset>
          <legend>Compliance & Submission</legend>
          <label>Submission Format<input name="submission_format" value={ess.submission_format} onChange={change} /></label>
          <label>Due Dates<input name="due_dates" value={ess.due_dates} onChange={change} placeholder="e.g., March 1, 2025; 2025-03-01" /></label>
        </fieldset>
        <div className="actions">
          <button onClick={generate}>Generate Half-Complete Template (Gemini)</button>
        </div>
      </div>

      <div className="card">
        <h2>Draft Proposal (Editable)</h2>
        {!draft ? <div className="status">No draft yet. Generate to prefill.</div> : (
          <DraftEditor draft={draft} onChange={updateDraft} />
        )}
        <div className="actions" style={{gap:8}}>
          <button onClick={()=>exportFile('pdf')}>Download PDF</button>
          <button onClick={()=>exportFile('docx')}>Download DOCX</button>
          <button onClick={()=>exportFile('xlsx')}>Download EXCEL</button>
        </div>
      </div>
    </div>
  );
}

function DraftEditor({ draft, onChange }){
  return (
    <div style={{display:'grid', gap:8}}>
      <TextField label="Executive Summary" path={["executive_summary"]} value={draft.executive_summary||''} onChange={onChange} />
      <TextField label="Goals" path={["project_description","goals"]} value={draft.project_description?.goals||''} onChange={onChange} />
      <TextField label="Scope" path={["project_description","scope"]} value={draft.project_description?.scope||''} onChange={onChange} />
      <TextField label="Timeline" path={["project_description","timeline"]} value={draft.project_description?.timeline||''} onChange={onChange} />
      <TextField label="Budget Narrative" path={["budget","narrative"]} value={draft.budget?.narrative||''} onChange={onChange} />
      <TextField label="Capacity" path={["capacity"]} value={draft.capacity||''} onChange={onChange} />
      <TextField label="Evaluation" path={["evaluation"]} value={draft.evaluation||''} onChange={onChange} />
      <TextField label="Outcomes" path={["outcomes"]} value={draft.outcomes||''} onChange={onChange} />
      <TextField label="Submission Format" path={["compliance_submission","submission_format"]} value={draft.compliance_submission?.submission_format||''} onChange={onChange} />
      <TextField label="Due Dates" path={["compliance_submission","due_dates"]} value={(draft.compliance_submission?.due_dates||'')} onChange={onChange} />
    </div>
  );
}

function TextField({ label, path, value, onChange }){
  return (
    <label>{label}
      <textarea rows={4} value={value} onChange={e=>onChange(path, e.target.value)} />
    </label>
  );
}

function setAtPath(obj, path, value){
  const next = JSON.parse(JSON.stringify(obj||{}));
  let cur = next;
  for (let i=0;i<path.length-1;i++){
    const k = path[i];
    cur[k] = cur[k] ?? {};
    cur = cur[k];
  }
  cur[path[path.length-1]] = value;
  return next;
}
