import React, { useEffect, useState } from 'react';
import axios from 'axios';

const defaultMap = {
  cover_letter: { title: 'Cover Letter' },
  executive_summary: { title: 'Executive Summary' },
  technical_approach: { title: 'Technical Approach' },
  management_plan: { title: 'Management Plan' },
  budget_narrative: { title: 'Budget Narrative' },
  evaluation_plan: { title: 'Evaluation Plan' },
};

export default function Templates() {
  const [list, setList] = useState([]);
  const [name, setName] = useState('Default Template');
  const [format, setFormat] = useState('md');
  const [sectionMap, setSectionMap] = useState(JSON.stringify(defaultMap, null, 2));
  const [variables, setVariables] = useState('{}');
  const [msg, setMsg] = useState('');

  async function refresh() {
    const { data } = await axios.get('/api/templates');
    setList(data);
  }

  useEffect(() => { refresh(); }, []);

  async function createTemplate(e) {
    e.preventDefault();
    setMsg('Creating template...');
    try {
      const { data } = await axios.post('/api/templates', {
        name, format, sectionMap, variables
      });
      setMsg('Created: ' + data.name);
      await refresh();
    } catch (e) {
      setMsg('Error: ' + (e.response?.data?.error || e.message));
    }
  }

  return (
    <div>
      <h3>Templates</h3>
      <form onSubmit={createTemplate} style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Template name" />
            <select value={format} onChange={(e)=>setFormat(e.target.value)}>
              <option value="md">Markdown</option>
              <option value="docx">DOCX</option>
              <option value="html">HTML</option>
            </select>
            <button type="submit">Create</button>
            <span>{msg}</span>
          </div>
          <label style={{ display:'block', marginTop:8 }}>Section Map (JSON)</label>
          <textarea rows={16} value={sectionMap} onChange={(e)=>setSectionMap(e.target.value)} style={{ width:'100%', fontFamily:'monospace' }} />
        </div>
        <div>
          <label>Variables (JSON)</label>
          <textarea rows={16} value={variables} onChange={(e)=>setVariables(e.target.value)} style={{ width:'100%', fontFamily:'monospace' }} />
          <h4 style={{ marginTop:16 }}>Existing Templates</h4>
          <ul>
            {list.map((t)=> (
              <li key={t._id}>
                {t.name} · {t.format} · sections: {Object.keys(t.sectionMap||{}).length}
              </li>
            ))}
          </ul>
        </div>
      </form>
    </div>
  );
}
