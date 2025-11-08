import Proposal from '../models/Proposal.js';
import ProposalSection from '../models/ProposalSection.js';
import Template from '../models/Template.js';
import Requirement from '../models/Requirement.js';

// Simple retrieval: pick requirements keywords matching section key
function retrieveForSection(requirements, sectionKey) {
  const key = (sectionKey || '').toLowerCase();
  const catMap = {
    executive_summary: ['scope', 'objectives', 'goals'],
    technical_approach: ['scope', 'tasks', 'deliverable'],
    management_plan: ['management', 'staff', 'timeline'],
    budget_narrative: ['budget', 'cost', 'cap', 'usd'],
    evaluation_plan: ['evaluation', 'outcome', 'measure'],
    cover_letter: ['eligibility', 'submission'],
  };
  const cats = catMap[sectionKey] || [];
  return requirements.filter((r) =>
    cats.some((c) => r.category?.toLowerCase().includes(c) || r.textSnippet?.toLowerCase().includes(c))
  );
}

export async function generateProposalDraft(rfpId, templateId, name) {
  const tpl = await Template.findById(templateId);
  if (!tpl) throw new Error('Template not found');
  const proposal = await Proposal.create({ rfpId, templateId, status: 'draft', name: name || 'Draft Proposal' });
  const requirements = await Requirement.find({ rfpId });

  const sections = [];
  for (const [key, spec] of Object.entries(tpl.sectionMap || {})) {
    const rel = retrieveForSection(requirements, key);
    const coverage = rel.map((r) => String(r._id));
    const md = `# ${spec.title || key}\n\n` +
      (rel.length
        ? `This section addresses the following requirements: ${coverage.join(', ')}.\n\n` +
          rel.map((r) => `- ${r.title} — ${r.textSnippet}`).join('\n')
        : 'No specific requirements detected. Provide a narrative aligned to the RFP.') +
      '\n';
    sections.push({ proposalId: proposal._id, templateSectionKey: key, title: spec.title || key, mdBody: md, coverage, citations: [] });
  }

  const created = await ProposalSection.insertMany(sections);
  return { proposal, sections: created };
}
