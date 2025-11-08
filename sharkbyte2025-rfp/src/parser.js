// Hard-coded JSON parser for RFP text per required fields
// Outputs an array of requirement objects with fields:
// id, clause_ref, title, category, priority, text_snippet, evidence_required[], submission_format,
// budget_caps, due_dates, keywords[]

const DATE_REGEX = /\b((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})\b/gi;
const MONEY_REGEX = /\$\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/g;

const SECTION_HEADERS = [
  'Eligibility',
  'Submission Requirements',
  'Scope of Work',
  'Scope',
  'Budget',
  'Funding',
  'Timeline',
  'Schedule',
  'Evaluation Criteria',
  'Compliance',
  'Contact',
  'Instructions',
  'Deliverables',
  'Proposal Format',
  'Administrative',
  'Terms and Conditions',
];

function detectSections(text) {
  const lines = text.split(/\r?\n/);
  const sections = [];
  let current = { title: 'General', content: [] };

  const headerPattern = new RegExp(
    `^(?:\\d+\\.|[A-Z]{1,3}\\.|[IVX]{1,4}\\.|)\\s*(?:${SECTION_HEADERS.map(h => h.replace(/[-/\\^$*+?.()|[\]{}]/g, r => r)).join('|')})\\b`,
    'i'
  );

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (headerPattern.test(line)) {
      // Push previous
      if (current.content.length) {
        sections.push(current);
      }
      current = { title: line.replace(/^[^A-Za-z]*/,'').trim(), content: [] };
    } else {
      current.content.push(line);
    }
  }
  if (current.content.length) sections.push(current);
  return sections;
}

function priorityFromText(snippet) {
  const s = snippet.toLowerCase();
  if (/(must|shall|required|mandatory)/.test(s)) return 'high';
  if (/(should|strongly encouraged|expected)/.test(s)) return 'medium';
  return 'low';
}

function categoryFromSectionTitle(title) {
  const t = title.toLowerCase();
  if (t.includes('eligibility')) return 'Eligibility';
  if (t.includes('budget') || t.includes('funding')) return 'Budget';
  if (t.includes('timeline') || t.includes('schedule')) return 'Timeline';
  if (t.includes('evaluation')) return 'Evaluation';
  if (t.includes('compliance') || t.includes('terms')) return 'Compliance';
  if (t.includes('deliverables') || t.includes('scope')) return 'Scope';
  if (t.includes('submission') || t.includes('format') || t.includes('instructions')) return 'Submission';
  if (t.includes('contact')) return 'Contact';
  return 'General';
}

function extractEvidence(lines) {
  const joined = lines.join(' ');
  const out = [];
  const patterns = [
    { key: 'financial statements', re: /financial statements?|audited financials?/i },
    { key: 'letters of support', re: /letters? of support/i },
    { key: 'certifications', re: /certifications?|licenses?/i },
    { key: 'resumes', re: /resumes?|cv\b/i },
    { key: 'work samples', re: /work samples?|portfolio/i },
    { key: 'past performance', re: /past performance|references?/i },
    { key: 'budget worksheet', re: /budget (worksheet|breakdown|narrative)/i },
    { key: 'compliance forms', re: /forms?|(affidavit|debarment|insurance) (form|certificate)/i },
  ];
  for (const p of patterns) {
    if (p.re.test(joined)) out.push(p.key);
  }
  return out;
}

function extractSubmissionFormat(lines) {
  const text = lines.join(' ').toLowerCase();
  const formats = [];
  if (/pdf/.test(text)) formats.push('PDF');
  if (/docx|word/.test(text)) formats.push('DOCX');
  if (/portal|online submission|website|url/.test(text)) formats.push('Online Portal');
  if (/hard ?copy|mail|postmarked/.test(text)) formats.push('Hard Copy');
  return formats.join(', ') || null;
}

function extractBudgetCaps(lines) {
  const joined = lines.join(' ');
  const caps = [];
  let m;
  while ((m = MONEY_REGEX.exec(joined)) !== null) {
    caps.push(`$${m[1]}`);
  }
  // Heuristic: if section mentions maximum or not-to-exceed
  if (/not to exceed|maximum|cap/i.test(joined) && caps.length) {
    return { type: 'cap', values: caps };
  }
  if (/total budget|available funding|award amount/i.test(joined) && caps.length) {
    return { type: 'budget', values: caps };
  }
  return caps.length ? { type: 'amounts', values: caps } : null;
}

function extractDueDates(lines) {
  const joined = lines.join(' ');
  const dates = [];
  let m;
  while ((m = DATE_REGEX.exec(joined)) !== null) {
    dates.push(m[1]);
  }
  return dates;
}

function makeId(sectionIndex, itemIndex) {
  return `req-${sectionIndex + 1}-${itemIndex + 1}`;
}

export function parseRfp(text) {
  const sections = detectSections(text);
  const results = [];

  sections.forEach((sec, si) => {
    const cat = categoryFromSectionTitle(sec.title);
    const content = sec.content.join('\n');

    // Split into bullet-like items for granularity
    const items = content.split(/\n\s*(?:[-•*]|\d+\.|[a-z]\))\s+/).filter(Boolean);
    const lines = content.split(/\n+/);

    const evidence = extractEvidence(lines);
    const submission_format = extractSubmissionFormat(lines);
    const budget_caps = extractBudgetCaps(lines);
    const due_dates = extractDueDates(lines);

    if (items.length === 0) {
      const snippet = content.slice(0, 500);
      results.push({
        id: makeId(si, 0),
        clause_ref: sec.title,
        title: sec.title,
        category: cat,
        priority: priorityFromText(snippet),
        text_snippet: snippet,
        evidence_required: evidence,
        submission_format,
        budget_caps,
        due_dates,
        keywords: [],
      });
      return;
    }

    items.forEach((it, ii) => {
      const snippet = it.slice(0, 500);
      const firstLine = it.split(/\n/)[0].trim();
      results.push({
        id: makeId(si, ii),
        clause_ref: `${sec.title} > Item ${ii + 1}`,
        title: firstLine.slice(0, 120),
        category: cat,
        priority: priorityFromText(it),
        text_snippet: snippet,
        evidence_required: evidence,
        submission_format,
        budget_caps,
        due_dates,
        keywords: [],
      });
    });
  });

  // If no sections detected, return a single general requirement
  if (results.length === 0 && text.trim()) {
    const snippet = text.slice(0, 500);
    results.push({
      id: 'req-1-1',
      clause_ref: 'General',
      title: 'General Requirements',
      category: 'General',
      priority: priorityFromText(text),
      text_snippet: snippet,
      evidence_required: [],
      submission_format: null,
      budget_caps: null,
      due_dates: [],
      keywords: [],
    });
  }

  return results;
}
