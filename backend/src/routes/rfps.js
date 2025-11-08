import { Router } from 'express';
import multer from 'multer';
import Rfp from '../models/Rfp.js';
import RfpSection from '../models/RfpSection.js';
import Requirement from '../models/Requirement.js';
import { extractTextFromBuffer, naiveSectionSplit } from '../services/parsing.js';
import { extractRequirementsForRfp } from '../services/extraction.js';

const upload = multer();
const router = Router();

router.get('/', async (req, res) => {
  const rfps = await Rfp.find().sort({ createdAt: -1 });
  res.json(rfps);
});

router.get('/:id', async (req, res) => {
  const rfp = await Rfp.findById(req.params.id);
  if (!rfp) return res.status(404).json({ error: 'RFP not found' });
  res.json(rfp);
});

router.get('/:id/sections', async (req, res) => {
  const sections = await RfpSection.find({ rfpId: req.params.id }).sort({ index: 1 });
  res.json(sections);
});

router.get('/:id/requirements', async (req, res) => {
  const reqs = await Requirement.find({ rfpId: req.params.id }).sort({ createdAt: 1 });
  res.json(reqs);
});

router.post('/ingest', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded. Use form field "file".' });
  const { originalname, buffer, mimetype } = req.file;
  const { text, metadata } = await extractTextFromBuffer(buffer, originalname || mimetype);
  const sections = naiveSectionSplit(text);

  const rfp = await Rfp.create({
    name: originalname,
    sourceFileName: originalname,
    sourceFileType: mimetype,
    ingestMetadata: metadata,
  });

  const sectionDocs = sections.map((s) => ({ ...s, rfpId: rfp._id }));
  await RfpSection.insertMany(sectionDocs);

  // Extract requirements (stub)
  const createdReqs = await extractRequirementsForRfp(rfp._id, sections);

  res.json({ rfp, sectionsCount: sectionDocs.length, requirementsCount: createdReqs.length });
});

export default router;
