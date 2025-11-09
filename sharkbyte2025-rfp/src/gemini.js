import { GoogleGenerativeAI } from "@google/generative-ai";

const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-1.5-flash-002';
const FALLBACK_MODELS = ['gemini-1.5-flash-8b', 'gemini-1.5-pro-002'];
const DEBUG = String(process.env.DEBUG_SUGGESTIONS || '0') === '1';

function getClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY is not set');
  }
  return new GoogleGenerativeAI(key);
}

async function generateTextWithFallback(prompt) {
  const genAI = getClient();
  const tryModels = [MODEL_NAME, ...FALLBACK_MODELS.filter(m => m !== MODEL_NAME)];
  let lastErr;
  for (const m of tryModels) {
    try {
      if (DEBUG) console.debug('[Gemini] Trying model:', m, 'promptChars=', String(prompt||'').length);
      const model = genAI.getGenerativeModel({ model: m });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      if (DEBUG) console.debug('[Gemini] Model success:', m, 'responseChars=', String(text||'').length);
      return text;
    } catch (e) {
      lastErr = e;
      const msg = (e && (e.message || e.toString())) || '';
      if (DEBUG) console.debug('[Gemini] Model error for', m, msg);
      const isModel404 = /not\s*found|404|unsupported|ListModels/i.test(msg);
      if (!isModel404) break; // do not keep retrying on non-model errors
    }
  }
  throw lastErr || new Error('Gemini generateContent failed');
}

export async function generateKeywords({ projectGoal = '', summary = '', rfpText = '' }) {
  const prompt = `You are assisting in preparing a grant proposal. Based on the project goal, a short summary, and redacted RFP text, propose a focused set of business-style keywords and phrases suitable for search and alignment (including sector, impact areas, compliance, and common grant tags). 

Return ONLY a JSON array of unique lowercase keyword strings, 8-20 items, no explanations.

project_goal:\n${projectGoal}\n\nsummary:\n${summary}\n\nredacted_rfp_excerpt:\n${rfpText.slice(0, 4000)}\n`;

  let text = '';
  try {
    text = await generateTextWithFallback(prompt);
  } catch (e) {
    // Last-resort local fallback: derive naive keywords from inputs
    const naive = (projectGoal + ' ' + summary)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 20);
    return Array.from(new Set(naive));
  }

  try {
    const jsonStart = text.indexOf('[');
    const jsonEnd = text.lastIndexOf(']');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const arr = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
      const uniq = Array.from(new Set(arr.map(x => String(x).toLowerCase().trim()))).filter(Boolean);
      return uniq;
    }
  } catch {}
  const fallback = text
    .replace(/\n/g, ' ')
    .split(',')
    .map(x => x.toLowerCase().trim())
    .filter(Boolean);
  return Array.from(new Set(fallback)).slice(0, 20);
}

export async function generateMissingSuggestions({ missingCategories = [], rfpText = '', parsedSummary = [], rubric = null }) {
  // Normalize categories to a canonical set to avoid mismatches (e.g., "Timeline/Milestones" → "Timeline")
  const normalizeCategory = (c) => {
    const s = String(c || '').toLowerCase();
    if (/timeline|milestone/.test(s)) return 'Timeline';
    if (/evaluation/.test(s)) return 'Evaluation';
    if (/submission|compliance/.test(s)) return 'Submission & Compliance';
    if (/budget/.test(s)) return 'Budget';
    if (/eligib/.test(s)) return 'Eligibility';
    if (/scope|activit|work\s*plan/.test(s)) return 'Scope & Activities';
    if (/goal|objective/.test(s)) return 'Goals & Objectives';
    if (/executive|summary/.test(s)) return 'Executive Summary';
    if (/capacity|organi/.test(s)) return 'Organizational Capacity';
    if (/outcome|impact/.test(s)) return 'Outcomes & Impact';
    if (/risk/.test(s)) return 'Risk & Mitigation';
    return c; // fallback to original
  };

  const normalized = Array.from(new Set(missingCategories.map(normalizeCategory)));

  // Category-specific fallbacks (summary + actions) for when the model is unavailable or returns generic guidance
  const CATEGORY_FALLBACKS = {
    'Evaluation': ({ parsedSummary }) => ({
      summary: 'Define how you will measure results. Specify KPIs, data sources, collection cadence, roles, and reporting to the funder.',
      actions: [
        'List 3–5 KPIs tied to your goals (e.g., completion rate, satisfaction, cost-per-outcome)',
        'Describe data sources and tools (surveys, CRM, audit logs) and who collects them',
        'Provide a reporting cadence (e.g., monthly dashboard + quarterly narrative) and decision-use',
        'Note baselines and targets; explain how you will address data quality and privacy'
      ]
    }),
    'Submission & Compliance': ({ parsedSummary }) => ({
      summary: 'Clarify exactly how and when to submit, and certify compliance items (format, signatures, registrations).',
      actions: [
        'State the official due date/time and timezone; include internal buffer date',
        'Specify required format(s) and portal/email; include filename conventions',
        'List compliance items (DUNS/UEI, SAM.gov, signatures, certifications) with owners',
        'Add an attachments checklist mapped to requirements and confirm page/word limits'
      ]
    }),
    'Timeline': ({ parsedSummary }) => ({
      summary: 'Provide a time-phased plan with start/end dates and milestones that align to deliverables and budget.',
      actions: [
        'Create a milestone table: activity, owner, start, end, dependency',
        'Align deliverable due dates with submission/reporting obligations',
        'Identify critical dependencies and risk buffers for key dates',
        'Show ramp-up, execution, and close-out phases with handoffs'
      ]
    }),
    'Budget': () => ({
      summary: 'Present a compliant line-item budget and a brief narrative that ties spend to activities and outcomes.',
      actions: [
        'List direct costs by category (personnel, fringe, equipment, travel, other) and totals',
        'Explain key assumptions (rates, quantities, unit costs) and any caps/allowances',
        'Map budget lines to activities/milestones; call out ineligible costs',
        'Include required match/cost-share and justification if applicable'
      ]
    }),
    'Eligibility': () => ({
      summary: 'Confirm that your organization and project meet all eligibility criteria and are not disqualified.',
      actions: [
        'State legal status, geography, and population served as required',
        'Affirm required registrations/certifications; disclose conflicts, if any',
        'Address any minimum experience or capacity thresholds explicitly'
      ]
    }),
    'Scope & Activities': () => ({
      summary: 'Detail the work plan: what will be done, by whom, for whom, and to what standard of completion.',
      actions: [
        'Break work into activities/workstreams with owners and completion criteria',
        'Tie activities to deliverables and outcomes; define acceptance criteria',
        'Identify stakeholders/beneficiaries and engagement approach'
      ]
    }),
    'Goals & Objectives': () => ({
      summary: 'State clear goals and SMART objectives that connect needs to outcomes and measurement.',
      actions: [
        'Write 2–4 goals; each with 1–3 SMART objectives (who/what/when/how measured)',
        'Explain how objectives ladder to outcomes and KPIs',
        'Indicate assumptions and constraints relevant to achieving objectives'
      ]
    }),
    'Executive Summary': () => ({
      summary: 'Summarize purpose, beneficiaries, approach, budget request, and expected impact in 1–2 paragraphs.',
      actions: [
        'Open with the problem and who benefits; quantify scope where possible',
        'Describe the solution at a glance and why your org is fit to deliver',
        'State total request, period of performance, and top-line outcomes'
      ]
    }),
    'Organizational Capacity': () => ({
      summary: 'Demonstrate team qualifications, governance, past performance, and delivery readiness.',
      actions: [
        'List key roles with experience; include org chart or RACI reference',
        'Cite relevant past projects with outcomes; include references if allowed',
        'Explain governance, internal controls, and vendor/partner management'
      ]
    }),
    'Outcomes & Impact': () => ({
      summary: 'Define outputs/outcomes and the impact you expect for the target population, with equity in view.',
      actions: [
        'Differentiate outputs vs outcomes; include target values and timeframe',
        'Explain impact pathways and equity considerations',
        'Describe how you will sustain impact post-grant (if applicable)'
      ]
    }),
    'Risk & Mitigation': () => ({
      summary: 'Identify major delivery, compliance, and timeline risks and how you will mitigate them.',
      actions: [
        'List top 3–5 risks with likelihood/impact and owners',
        'Provide mitigation and contingency steps per risk',
        'Note monitoring triggers and escalation paths'
      ]
    }),
  };

  // Keywords per category for a simple relevance score
  const CATEGORY_KEYWORDS = {
    'Evaluation': ['kpi','indicator','metric','baseline','target','data','measure','report','cadence','survey'],
    'Submission & Compliance': ['submit','portal','format','pdf','signature','uei','sam','certification','deadline','timezone','page','limit','checklist'],
    'Timeline': ['timeline','milestone','start','end','gantt','phase','dependency','date','due','schedule'],
    'Budget': ['budget','line','cost','narrative','assumption','cap','match','cost-share','allowable','unit'],
    'Eligibility': ['eligibility','qualified','criteria','threshold','disqualify','registered'],
    'Scope & Activities': ['scope','activity','workstream','deliverable','acceptance','standard'],
    'Goals & Objectives': ['goal','objective','smart','measurable','achievable','relevant','time-bound'],
    'Executive Summary': ['summary','overview','purpose','beneficiary','request'],
    'Organizational Capacity': ['capacity','experience','governance','control','staff','roles'],
    'Outcomes & Impact': ['outcome','impact','output','benefit','equity','sustain'],
    'Risk & Mitigation': ['risk','mitigate','contingency','likelihood','impact','escalation']
  };

  function relevanceScoreFor(category, text) {
    const terms = CATEGORY_KEYWORDS[category] || [];
    const s = String(text || '').toLowerCase();
    let score = 0;
    for (const t of terms) if (s.includes(t)) score++;
    return score / Math.max(1, terms.length);
  }
  if (!missingCategories.length) return {};
  const prompt = `You are an expert grant reviewer. Using the redacted excerpt of the user's uploaded RFP and a compact summary of the parsed requirements, provide document-specific, actionable guidance for each missing section. Judge by similarity of structure to a GOOD RFP (provided), not exact wording. Reference related requirement IDs when they partially cover the need.

Rules:
- Tailor guidance to the specific category (do NOT reuse generic language across unrelated categories).
- Use category-appropriate terminology (e.g., KPIs for Evaluation; due dates/format/checklist for Submission & Compliance; milestones/dates/dependencies for Timeline).
- Only return the categories listed below, using the exact keys.

STRICT OUTPUT: Return ONLY JSON with the following shape (no prose):\n{
  "<Category>": {
    "summary": "1-3 sentence explanation referencing the user's content where helpful",
    "actions": ["short imperative actions, specific to the user's document"],
    "related_requirements": [{ "id": "REQ-3", "evidence": "optional", "due_date": "optional" }],
    "confidence": 0.0-1.0
  },
  ...
}

CATEGORIES (use these exact keys): ${normalized.join(', ')}

GOOD_RFP_RUBRIC:\n${JSON.stringify(rubric || { sections: [] }).slice(0, 6000)}\n
PARSED_SUMMARY (from the user's uploaded RFP):\n${JSON.stringify(parsedSummary).slice(0, 6000)}\n
REDACTED_RFP_EXCERPT:\n${rfpText.slice(0, 3000)}\n`;

  let text = '';
  try {
    if (DEBUG) {
      console.debug('[Suggestions] normalized categories:', normalized);
      console.debug('[Suggestions] parsedSummary items:', Array.isArray(parsedSummary) ? parsedSummary.length : 0, 'rfpTextLen:', String(rfpText||'').length);
    }
    text = await generateTextWithFallback(prompt);
    if (DEBUG) console.debug('[Suggestions] raw model text (first 600 chars):', String(text||'').slice(0,600));
  } catch {
    if (DEBUG) console.debug('[Suggestions] model failed, using curated fallbacks');
    // Fallback: category-specific structured guidance
    const normToSuggestion = {};
    for (const ncat of normalized) {
      const builder = CATEGORY_FALLBACKS[ncat] || (() => ({ summary: 'Provide concise, funder-aligned content specific to this section.', actions: [] }));
      const base = builder({ parsedSummary, rfpText });
      normToSuggestion[ncat] = {
        summary: base.summary,
        actions: (base.actions || []).slice(0, 6),
        related_requirements: [],
        confidence: 0.45,
      };
    }
    // Map back to original keys expected by the client
    const out = {};
    for (const orig of missingCategories) {
      const ncat = normalizeCategory(orig);
      out[orig] = normToSuggestion[ncat] || { summary: 'Provide concise, funder-aligned content specific to this section.', actions: [], related_requirements: [], confidence: 0.4 };
    }
    return out;
  }
  // Try to parse JSON object
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      const obj = JSON.parse(text.slice(start, end + 1));
      const out = {};
      for (const orig of missingCategories) {
        const ncat = normalizeCategory(orig);
        const v = obj[orig] ?? obj[ncat];
        if (!v) {
          // If the model omitted this key, synthesize from fallback
          const fb = CATEGORY_FALLBACKS[ncat]?.({ parsedSummary, rfpText });
          if (fb) {
            out[orig] = { summary: fb.summary, actions: fb.actions.slice(0, 4), related_requirements: [], confidence: 0.45 };
          }
          continue;
        }
        if (typeof v === 'string') {
          out[orig] = { summary: v, actions: [], related_requirements: [], confidence: 0.5 };
        } else {
          const rawActions = Array.isArray(v.actions) ? v.actions.map(a => String(a)) : [];
          // Filter actions by category relevance
          const scored = rawActions.map(a => ({ a, s: relevanceScoreFor(ncat, a) }));
          const kept = scored
            .filter(x => x.s >= 0.08 || /:\s|\d{4}|deadline|due|kpi|milestone|submit|portal|page|limit|signature/i.test(x.a))
            .sort((x,y) => y.s - x.s)
            .map(x => x.a)
            .slice(0, 6);
          let actions = kept;
          if (actions.length === 0) {
            const fb = CATEGORY_FALLBACKS[ncat]?.({ parsedSummary, rfpText });
            if (fb?.actions?.length) actions = fb.actions.slice(0, 3);
          }
          const relReqs = Array.isArray(v.related_requirements)
            ? v.related_requirements.map(r => ({ id: String(r.id || ''), evidence: r.evidence ? String(r.evidence) : undefined, due_date: r.due_date ? String(r.due_date) : undefined })).filter(x => x.id).slice(0, 6)
            : [];
          let conf = typeof v.confidence === 'number' ? Math.max(0, Math.min(1, v.confidence)) : 0.6;
          const dropFrac = rawActions.length ? 1 - (actions.length / rawActions.length) : 0;
          if (dropFrac > 0.6) conf = Math.max(0.35, conf - 0.2);
          out[orig] = {
            summary: String(v.summary || '').trim() || (CATEGORY_FALLBACKS[ncat]?.({ parsedSummary, rfpText })?.summary || 'Add concise, funder-aligned content for this section.'),
            actions,
            related_requirements: relReqs,
            confidence: conf,
          };
        }
      }
      return out;
    }
  } catch {}
  // Last fallback: simple strings
  const out = {};
  for (const k of missingCategories) out[k] = { summary: 'Provide a concise, outcomes-focused description tailored to the funder requirements.', actions: [], related_requirements: [], confidence: 0.4 };
  return out;
}

export async function generateAutoKeywords({ introText = '', introType = 'unknown', webSnippets = [] }) {
  const redactedIntro = String(introText || '').slice(0, 6000);
  const webBundle = Array.isArray(webSnippets) ? webSnippets.slice(0, 6) : [];
  const webTxt = webBundle.map((s, i) => `#${i+1} ${s.title}\n${s.snippet}`).join('\n---\n');

  const prompt = `You analyze a redacted Request for Proposal (RFP) introduction and, if provided, recent public web snippets. Your task is to infer the domain, scope, and intent and propose 12-30 relevant keywords and short keyphrases that a vendor would use to align their proposal and search for similar work. Do NOT rely on any user-provided goals; use only the RFP intro and optional public context. Prefer multi-word phrases when appropriate. Include synonyms where valuable. Avoid overly generic words like "project", "solution", "team".

Strict JSON only. Return: { "keywords": [{ "term": string, "weight": 0-1 }], "notes": string }
- Terms must be lowercase.
- Weights indicate relevance and specificity (omit or set 0.5 if uncertain).
- No explanations outside JSON.

intro_type: ${introType}
RFP_INTRO (redacted, truncated):\n${redactedIntro}\n
PUBLIC_WEB_SNIPPETS (optional):\n${webTxt}`;

  let text = '';
  try {
    text = await generateTextWithFallback(prompt);
  } catch (e) {
    // fall through to deterministic fallback
  }
  // Try parse JSON with keywords array
  if (text) {
    try {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        const obj = JSON.parse(text.slice(start, end + 1));
        const arr = Array.isArray(obj.keywords) ? obj.keywords : [];
        const cleaned = arr.map(k => {
          if (typeof k === 'string') return { term: k };
          return { term: String(k.term || '').toLowerCase().trim(), weight: typeof k.weight === 'number' ? Math.max(0, Math.min(1, k.weight)) : undefined };
        }).filter(x => x.term && x.term.length > 2);
        const uniq = Array.from(new Map(cleaned.map(k => [k.term, k])).values()).slice(0, 30);
        if (uniq.length) return uniq;
      }
    } catch {}
  }
  // Deterministic fallback: extract noun-like terms by frequency from intro + web snippets
  const textPool = (redactedIntro + '\n' + webBundle.map(s => s.title + ' ' + s.snippet).join('\n')).toLowerCase();
  const words = textPool
    .replace(/[^a-z0-9\s\-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOP_WORDS.has(w));
  const freq = new Map();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  const top = Array.from(freq.entries())
    .sort((a,b) => b[1]-a[1])
    .slice(0, 40)
    .map(([term, count]) => ({ term, weight: Math.min(1, count / Math.max(3, words.length/100)) }));
  return top.slice(0, 20);
}

const STOP_WORDS = new Set(['the','and','for','with','that','from','this','into','your','have','will','shall','must','should','would','could','their','about','under','were','been','being','which','while','than','then','over','such','each','only','also','because','within','without','across','between','among','after','before','during','until','again','more','most','some','any','other','same','both','very','onto','ours','ourselves','themselves','himself','herself','itself','please','grant','rfp','request','proposal','program','project','solution','vendor','contractor','provide','including','include','based','support','services','service','deliver','delivery','plan','plans','approach','section','section','page','pages','appendix','attachment','requirements','requirement','shall','herein','thereof','therein']);

export async function generateTemplateFromEssentials({ essentials = {} }) {
  const prompt = `Create a half-complete grant proposal template filled from the provided essentials. Keep language professional and concise. Return ONLY JSON with keys: cover, executive_summary, project_description { goals, scope, timeline }, budget { total, narrative }, capacity, evaluation, outcomes, compliance_submission { submission_format, due_dates, attachments }.

Essentials JSON:\n${JSON.stringify(essentials).slice(0, 6000)}\n`;

  let text = '';
  try {
    text = await generateTextWithFallback(prompt);
  } catch {
    return { cover: {}, executive_summary: '', project_description: {}, budget: {}, capacity: '', evaluation: '', outcomes: '', compliance_submission: {} };
  }
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      return JSON.parse(text.slice(start, end + 1));
    }
  } catch {}
  return { cover: {}, executive_summary: '', project_description: {}, budget: {}, capacity: '', evaluation: '', outcomes: '', compliance_submission: {} };
}
