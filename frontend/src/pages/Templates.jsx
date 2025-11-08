import React, { useEffect, useState } from 'react';
import axios from 'axios';

const initialSections = {
  cover_letter: { title: 'Cover Letter', guidance: '', optional: false },
  executive_summary: { title: 'Executive Summary', guidance: '', optional: false },
  technical_approach: { title: 'Technical Approach', guidance: '', optional: false },
  management_plan: { title: 'Management Plan', guidance: '', optional: false },
  budget_narrative: { title: 'Budget Narrative', guidance: '', optional: false },
  evaluation_plan: { title: 'Evaluation Plan', guidance: '', optional: true },
};

export default function Templates() {
  const [list, setList] = useState([]);
  const [name, setName] = useState('RFP Template v1');
  const [format, setFormat] = useState('md');
  const [sections, setSections] = useState(initialSections);
  const [variables, setVariables] = useState('{}');
  const [msg, setMsg] = useState('');

  async function refresh() {
    const { data } = await axios.get('/api/templates');
    setList(data);
  }

  useEffect(() => { refresh(); }, []);

  function updateSection(key, field, value) {
    setSections(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }

  function buildSectionMap() {
    const map = {};
    for (const [k, v] of Object.entries(sections)) {
      map[k] = { title: v.title, guidance: v.guidance, optional: !!v.optional };
    }
    return map;
  }

  async function createTemplate(e) {
    e.preventDefault();
    setMsg('Creating template...');
    try {
      const sectionMap = JSON.stringify(buildSectionMap());
      const { data } = await axios.post('/api/templates', {
        name, format, sectionMap, variables
      });
      setMsg('Created: ' + data.name);
      await refresh();
    } catch (e) {
      setMsg('Error: ' + (e.response?.data?.error || e.message));
    }
  }

  const sectionOrder = Object.keys(sections);

  return (
    <div>
      <h3>Template</h3>
      <p>Create a fillable RFP template. Use the example provided in samples/RFP Template.pdf and the GOOD RFP as guidance.</p>
      <form onSubmit={createTemplate}>
        <div style={{ display:'flex', gap:12, alignItems:'center', marginBottom:12 }}>
          <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Template name" />
          <select value={format} onChange={(e)=>setFormat(e.target.value)}>
            <option value="md">Markdown</option>
            <option value="docx">DOCX</option>
            <option value="html">HTML</option>
          </select>
          <button type="submit">Save Template</button>
          <span>{msg}</span>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          {sectionOrder.map((key)=> (
            <fieldset key={key} style={{ border:'1px solid #ddd', padding:12 }}>
              <legend style={{ padding:'0 6px' }}>{sections[key].title}</legend>
              <label style={{ display:'block', fontSize:12, color:'#666' }}>Section Title</label>
              <input
                style={{ width:'100%', marginBottom:8 }}
                value={sections[key].title}
                onChange={(e)=>updateSection(key, 'title', e.target.value)}
              />
              <label style={{ display:'block', fontSize:12, color:'#666' }}>Guidance / Instructions</label>
              <textarea
                rows={6}
                style={{ width:'100%', fontFamily:'system-ui' }}
                placeholder="Provide guidance for what to include based on the template."
                value={sections[key].guidance}
                onChange={(e)=>updateSection(key, 'guidance', e.target.value)}
              />
              <label style={{ display:'flex', gap:8, alignItems:'center', marginTop:8 }}>
                <input
                  type="checkbox"
                  checked={!!sections[key].optional}
                  onChange={(e)=>updateSection(key, 'optional', e.target.checked)}
                />
                Optional / Additional information may be included
              </label>
            </fieldset>
          ))}
        </div>

        <div style={{ marginTop:16 }}>
          <label>Variables (JSON)</label>
          <textarea rows={8} value={variables} onChange={(e)=>setVariables(e.target.value)} style={{ width:'100%', fontFamily:'monospace' }} />
        </div>
      </form>

      <h4 style={{ marginTop:16 }}>Existing Templates</h4>
      <ul>
        {list.map((t)=> (
          <li key={t._id}>
            {t.name} · {t.format} · sections: {Object.keys(t.sectionMap||{}).length}
          </li>
        ))}
      </ul>
    </div>
  );
}
