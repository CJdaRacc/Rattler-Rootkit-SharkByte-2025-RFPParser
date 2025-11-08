(function(){
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.tab-panel');
  tabs.forEach(btn => btn.addEventListener('click', () => {
    tabs.forEach(b => b.classList.remove('active'));
    panels.forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  }));

  const analyzeForm = document.getElementById('analyze-form');
  const rfpFile = document.getElementById('rfpFile');
  const analyzeStatus = document.getElementById('analyze-status');
  const parsedEl = document.getElementById('parsed');
  const extractedTextEl = document.getElementById('extractedText');

  const projectGoalEl = document.getElementById('projectGoal');
  const summaryEl = document.getElementById('summary');
  const btnKeywords = document.getElementById('btnKeywords');
  const keywordsEl = document.getElementById('keywords');

  const attachmentsList = document.getElementById('attachments-list');
  const templateForm = document.getElementById('template-form');
  const btnExport = document.getElementById('btnExport');

  let lastExtractedText = '';
  let lastParsed = [];

  analyzeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!rfpFile.files[0]) return;
    analyzeStatus.textContent = 'Analyzing PDF...';
    parsedEl.innerHTML = '';
    extractedTextEl.textContent = '';
    keywordsEl.innerHTML = '';

    const fd = new FormData();
    fd.append('rfp', rfpFile.files[0]);

    try {
      const res = await fetch('/api/analyze', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('Analyze failed');
      const data = await res.json();

      lastExtractedText = data.extractedText || '';
      lastParsed = data.parsed || [];

      analyzeStatus.textContent = `Analyzed: ${data.filename} (${data.meta?.numPages || '?'} pages)`;
      extractedTextEl.textContent = lastExtractedText;

      renderParsed(lastParsed);
      populateTemplateFromParsed(lastParsed);
      btnKeywords.disabled = false;
    } catch (err) {
      console.error(err);
      analyzeStatus.textContent = 'Error analyzing PDF.';
    }
  });

  function renderParsed(items){
    if (!items || items.length === 0) {
      parsedEl.innerHTML = '<em>No requirements parsed.</em>';
      return;
    }
    const container = document.createElement('div');
    container.className = 'requirements';
    items.forEach(it => {
      const card = document.createElement('div');
      card.className = 'req-item';
      card.innerHTML = `
        <div class="req-head">
          <span class="req-id">${it.id}</span>
          <span class="req-title">${escapeHtml(it.title || '')}</span>
          <span class="req-cat">${escapeHtml(it.category || '')}</span>
          <span class="req-prio prio-${it.priority}">${it.priority}</span>
        </div>
        <div class="req-body">
          <div><strong>Clause:</strong> ${escapeHtml(it.clause_ref || '')}</div>
          <div class="snippet">${escapeHtml(it.text_snippet || '')}</div>
          <div><strong>Evidence:</strong> ${(it.evidence_required||[]).map(escapeHtml).join(', ') || '—'}</div>
          <div><strong>Submission Format:</strong> ${escapeHtml(it.submission_format || '—')}</div>
          <div><strong>Budget Caps:</strong> ${formatBudgetCaps(it.budget_caps) || '—'}</div>
          <div><strong>Due Dates:</strong> ${(it.due_dates||[]).join('; ') || '—'}</div>
          <div><strong>Keywords:</strong> ${(it.keywords||[]).join(', ') || '—'}</div>
        </div>
      `;
      container.appendChild(card);
    });
    parsedEl.innerHTML = '';
    parsedEl.appendChild(container);
  }

  function formatBudgetCaps(b) {
    if (!b) return '';
    if (b.type && b.values) return `${b.type}: ${b.values.join(', ')}`;
    return JSON.stringify(b);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  btnKeywords.addEventListener('click', async () => {
    btnKeywords.disabled = true;
    btnKeywords.textContent = 'Generating...';
    try {
      const res = await fetch('/api/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectGoal: projectGoalEl.value || '',
          summary: summaryEl.value || '',
          rfpText: lastExtractedText || '',
        }),
      });
      const data = await res.json();
      const kw = data.keywords || [];
      renderKeywords(kw);
      // attach to each parsed item as well (display only; not persisted server-side)
      lastParsed = lastParsed.map(it => ({...it, keywords: kw}));
      renderParsed(lastParsed);
    } catch (e) {
      console.error(e);
    } finally {
      btnKeywords.textContent = 'Generate Keywords (Gemini)';
      btnKeywords.disabled = false;
    }
  });

  function renderKeywords(list){
    keywordsEl.innerHTML = '';
    list.forEach(k => {
      const s = document.createElement('span');
      s.className = 'pill';
      s.textContent = k;
      keywordsEl.appendChild(s);
    });
  }

  function populateTemplateFromParsed(items) {
    // Collect evidence list and common submission format / due dates
    const evidence = new Set();
    const formats = new Set();
    const dueDates = new Set();
    (items || []).forEach(it => {
      (it.evidence_required || []).forEach(e => evidence.add(e));
      if (it.submission_format) formats.add(it.submission_format);
      (it.due_dates || []).forEach(d => dueDates.add(d));
    });

    // Populate attachments checklist
    attachmentsList.innerHTML = '';
    if (evidence.size === 0) {
      attachmentsList.textContent = '—';
    } else {
      Array.from(evidence).forEach(ev => {
        const id = 'att-' + ev.replace(/\W+/g,'-');
        const label = document.createElement('label');
        label.className = 'checkbox';
        label.innerHTML = `<input type="checkbox" name="attachment_${id}" /> ${escapeHtml(ev)}`;
        attachmentsList.appendChild(label);
      });
    }

    // Pre-fill simple fields
    const sf = templateForm.querySelector('input[name="submission_format"]');
    if (sf) sf.value = Array.from(formats).join('; ');
    const dd = templateForm.querySelector('input[name="due_dates"]');
    if (dd) dd.value = Array.from(dueDates).join('; ');
  }

  btnExport.addEventListener('click', () => {
    const payload = formToJson(templateForm);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'proposal-template.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  function formToJson(form){
    const data = {};
    const fd = new FormData(form);
    for (const [k,v] of fd.entries()) {
      if (data[k] !== undefined) {
        if (Array.isArray(data[k])) data[k].push(v); else data[k] = [data[k], v];
      } else {
        data[k] = v;
      }
    }
    return data;
  }
})();
