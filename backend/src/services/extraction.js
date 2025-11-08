import Requirement from '../models/Requirement.js';

// Very naive keyword/rule-based extractor as a fallback (no LLM required)
export async function extractRequirementsForRfp(rfpId, sections) {
  const reqs = [];
  const keywords = [
    { category: 'eligibility', terms: ['eligible', 'eligibility', '501(c)(3)', 'non-profit', 'for-profit not'] },
    { category: 'budget', terms: ['budget', 'cost', 'cap', '$', 'USD', 'maximum'] },
    { category: 'deliverable', terms: ['deliverable', 'report', 'milestone', 'outcome'] },
    { category: 'submission', terms: ['submit', 'submission', 'page limit', 'font', 'format', 'deadline', 'due'] },
    { category: 'scope', terms: ['scope', 'objectives', 'goals', 'tasks', 'activities'] },
  ];

  for (const s of sections) {
    const text = s.text || '';
    const matches = [];
    for (const k of keywords) {
      if (k.terms.some((t) => text.toLowerCase().includes(t.toLowerCase()))) {
        matches.push(k.category);
      }
    }
    if (matches.length) {
      for (const cat of matches) {
        const snippet = text.split('\n').slice(0, 3).join(' ').slice(0, 300);
        reqs.push({
          rfpId,
          clauseRef: s.title,
          title: `${cat} requirement from ${s.title}`,
          textSnippet: snippet,
          category: cat,
          priority: 'should',
          evidenceRequired: [],
          submissionFormat: {},
          budgetCaps: {},
          dueDates: {},
          keywords: [cat],
          coverageStatus: 'uncovered',
        });
      }
    }
  }

  if (reqs.length === 0) {
    // Always create at least one placeholder requirement so the UI has something to show
    reqs.push({
      rfpId,
      clauseRef: 'N/A',
      title: 'General requirement (placeholder)',
      textSnippet: 'Could not auto-detect; please run LLM extractor or annotate manually.',
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

  const created = await Requirement.insertMany(reqs);
  return created;
}
