import fs from 'fs/promises';
import path from 'path';
import Proposal from '../models/Proposal.js';
import ProposalSection from '../models/ProposalSection.js';

export async function exportProposalMarkdown(proposalId, outDir = 'exports') {
  const proposal = await Proposal.findById(proposalId);
  if (!proposal) throw new Error('Proposal not found');
  const sections = await ProposalSection.find({ proposalId }).sort({ createdAt: 1 });
  const md = sections.map((s) => s.mdBody || '').join('\n\n');
  const fileName = `${proposalId}.md`;
  const dir = path.resolve(process.cwd(), outDir);
  await fs.mkdir(dir, { recursive: true });
  const fullPath = path.join(dir, fileName);
  await fs.writeFile(fullPath, md, 'utf8');
  proposal.exportedPaths = { ...(proposal.exportedPaths || {}), markdown: fullPath };
  await proposal.save();
  return { path: fullPath };
}
