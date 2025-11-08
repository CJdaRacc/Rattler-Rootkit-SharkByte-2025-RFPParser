import { Router } from 'express';
import multer from 'multer';
import Template from '../models/Template.js';

const upload = multer();
const router = Router();

router.get('/', async (req, res) => {
  const list = await Template.find().sort({ createdAt: -1 });
  res.json(list);
});

router.post('/', upload.single('file'), async (req, res) => {
  const { name, format = 'md', variables = '{}', sectionMap = '{}' } = req.body;
  let srcName = undefined;
  if (req.file) {
    srcName = req.file.originalname;
  }
  const tpl = await Template.create({
    name: name || srcName || 'Untitled Template',
    format,
    variables: safeParseJson(variables, {}),
    sectionMap: safeParseJson(sectionMap, defaultSectionMap()),
    sourceFileName: srcName,
  });
  res.json(tpl);
});

function defaultSectionMap() {
  return {
    cover_letter: { title: 'Cover Letter' },
    executive_summary: { title: 'Executive Summary' },
    technical_approach: { title: 'Technical Approach' },
    management_plan: { title: 'Management Plan' },
    budget_narrative: { title: 'Budget Narrative' },
    evaluation_plan: { title: 'Evaluation Plan' },
  };
}

function safeParseJson(s, fallback) {
  try { return typeof s === 'string' ? JSON.parse(s) : s; } catch { return fallback; }
}

export default router;
