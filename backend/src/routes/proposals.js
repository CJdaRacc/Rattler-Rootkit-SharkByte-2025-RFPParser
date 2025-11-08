import { Router } from 'express';
import Proposal from '../models/Proposal.js';
import ProposalSection from '../models/ProposalSection.js';
import { generateProposalDraft } from '../services/generation.js';
import { exportProposalMarkdown } from '../services/export.js';

const router = Router();

router.get('/', async (req, res) => {
  const list = await Proposal.find().sort({ createdAt: -1 });
  res.json(list);
});

router.get('/:id', async (req, res) => {
  const p = await Proposal.findById(req.params.id);
  if (!p) return res.status(404).json({ error: 'Proposal not found' });
  res.json(p);
});

router.get('/:id/sections', async (req, res) => {
  const sections = await ProposalSection.find({ proposalId: req.params.id }).sort({ createdAt: 1 });
  res.json(sections);
});

router.post('/generate', async (req, res) => {
  const { rfpId, templateId, name } = req.body;
  if (!rfpId || !templateId) return res.status(400).json({ error: 'rfpId and templateId are required' });
  const result = await generateProposalDraft(rfpId, templateId, name);
  res.json(result);
});

router.get('/:id/export', async (req, res) => {
  try {
    const { path } = await exportProposalMarkdown(req.params.id);
    res.json({ ok: true, path });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
