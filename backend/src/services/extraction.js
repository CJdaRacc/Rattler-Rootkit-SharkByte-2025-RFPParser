import Requirement from '../models/Requirement.js';
import { redactPII, summarizeForLLM } from './redaction.js';
import { generateKeywordsFromSummary } from './llm/gemini.js';

// Deterministic requirement extractor producing strict fields.
// Uses heuristics for fields; calls Gemini ONLY to enrich keywords[] with redacted summaries.
export async function extractRequirementsForRfp(rfpId, sections) {
  const reqs = [];

  for (const s of sections) {
    const text = s.text || '';
    const lower = text.toLowerCase();

    // Identify candidate sentences with modal verbs indicating requirements
    const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
    const requirementLines = sentences.filter((ln) => /\b(must|shall|required|need to|is required to|will)\b/i.test(ln));

    const category = inferCategory(text);
    const priority = inferPriority(text);
    const submissionFormat = extractSubmissionFormat(text);
    const budgetCaps = extractBudget(text);
    const dueDates = extractDueDates(text);
    const evidenceRequired = extractEvidence(text);

    if (requirementLines.length === 0 && (category || hasAnySignal(text))) {
      // Create a soft requirement based on the section content
      const snippet = text.split('\n').slice(0, 3).join(' ').slice(0, 300);
      reqs.push({
        rfpId,
        clauseRef: s.title,
        title: `${category || 'general'} requirement from ${s.title}`,
        textSnippet: snippet,
        category: category || 'general',
        priority: priority || 'should',
        evidenceRequired,
        submissionFormat,
        budgetCaps,
        dueDates,
        keywords: [],
        coverageStatus: 'uncovered',
      });
      continue;
    }

    for (const ln of requirementLines) {
      const snippet = ln.trim().slice(0, 300);
      reqs.push({
        rfpId,
        clauseRef: s.title,
        title: makeTitleFromLine(ln, s.title, category),
        textSnippet: snippet,
        category: category || 'general',
        priority: inferPriority(ln) || priority || 'should',
        evidenceRequired,
        submissionFormat,
        budgetCaps,
        dueDates,
        keywords: [],
        coverageStatus: 'uncovered',
      });
    }
  }

  // If none found, ensure one placeholder
  if (reqs.length === 0) {
    reqs.push({
      rfpId,
      clauseRef: 'N/A',
      title: 'General requirement (placeholder)',
      textSnippet: 'Could not auto-detect; please annotate manually.',
      category: 'general',
      priority: 'should',
      evidenceRequired: [],
      submissionFormat: {},
      budgetCaps: {},
      dueDates: {},
      keywords: ['general'],
      coverageStatus: 'uncovered',
    });
  }

  // Enrich keywords[] using Gemini with REDACTED summary of the whole RFP context
  try {
    const joined = sections.map((x) => x.text).join('\n').slice(0, 50000);
    const redacted = redactPII(joined);
    const summary = summarizeForLLM(redacted, 4000);
    const kws = await generateKeywordsFromSummary({ summary, goal: inferGoalFromSections(sections) });
    if (Array.isArray(kws) && kws.length) {
      for (const r of reqs) {
        r.keywords = Array.from(new Set([...(r.keywords || []), ...kws])).slice(0, 25);
      }
    }
  } catch (e) {
    // Swallow keyword enrichment errors silently; continue with baseline
  }

  const created = await Requirement.insertMany(reqs);
  return created;
}

function makeTitleFromLine(line, sectionTitle, category) {
  const base = line.replace(/\s+/g, ' ').trim().slice(0, 80);
  return `${category || 'Requirement'} — ${base || sectionTitle}`;
}

function hasAnySignal(text) {
  return /(eligible|eligibility|501\(c\)\(3\)|non-profit|budget|cost|cap|deliverable|milestone|submit|submission|page limit|font|format|deadline|scope|objective|goal|task|activity)/i.test(text);
}

function inferCategory(text) {
  const t = text.toLowerCase();
  if (/eligib|501\(c\)\(3\)|non[- ]?profit/.test(t)) return 'eligibility';
  if (/(budget|cost|usd|\$|cap|max(imum)?)/.test(t)) return 'budget';
  if (/(deliverable|report|milestone|outcome)/.test(t)) return 'deliverable';
  if (/(submit|submission|page limit|font|format|deadline|due|margi?n)/.test(t)) return 'submission';
  if (/(scope|objective|goal|task|activity)/.test(t)) return 'scope';
  return null;
}

function inferPriority(text) {
  if (/\b(must|shall|required)\b/i.test(text)) return 'must';
  if (/\b(should|recommended)\b/i.test(text)) return 'should';
  return 'nice';
}

function extractEvidence(text) {
  const ev = [];
  if (/irs\s+determination\s+letter/i.test(text)) ev.push('IRS determination letter');
  if (/letter\s+of\s+support/i.test(text)) ev.push('Letter of support');
  if (/resume|cv/i.test(text)) ev.push('Resumes/CVs');
  if (/certificate|certification/i.test(text)) ev.push('Certificates');
  return ev;
}

function extractSubmissionFormat(text) {
  const o = {};
  const mPages = text.match(/(maximum|max|no more than)\s+(\d{1,3})\s+(pages?)/i);
  if (mPages) o.max_pages = parseInt(mPages[2], 10);
  const font = text.match(/(font|typeface)\s*(size)?\s*(\d{1,2})\s*(pt|point)/i);
  if (font) o.font = ">=" + font[3] + 'pt';
  const file = text.match(/(pdf|docx|html)\b/i);
  if (file) o.file_type = file[1].toUpperCase();
  return o;
}

function extractBudget(text) {
  const o = {};
  const money = text.match(/\$\s?([0-9,.]{3,})/);
  if (money) o.total_max_usd = Number(money[1].replace(/[,]/g, ''));
  return o;
}

function extractDueDates(text) {
  const o = {};
  const date = text.match(/(\bby\b|deadline|due)\s*[:\-]?\s*(\w+\s+\d{1,2},\s*\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (date) o.submission_deadline = date[2];
  return o;
}

function inferGoalFromSections(sections) {
  const intro = sections.find((s)=>/executive|overview|purpose|goals?/i.test(s.title||'')) || sections[0];
  return (intro?.text || '').split('\n').slice(0, 5).join(' ');
}
