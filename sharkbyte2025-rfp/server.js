import express from 'express';
import multer from 'multer';
import cors from 'cors';
import dotenv from 'dotenv';
import pdfParse from 'pdf-parse';
import path from 'path';
import crypto from 'crypto';
import mongoose from 'mongoose';

import { parseRfp } from './src/parser.js';
import { generateKeywords } from './src/gemini.js';
import { redactSensitive } from './src/redact.js';
import { Rfp } from './src/models/Rfp.js';
import { Proposal } from './src/models/Proposal.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// MongoDB connection (MERN)
const MONGO_URI = process.env.MONGO_URI;
if (MONGO_URI) {
  mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err.message));
} else {
  console.warn('MONGO_URI not set; persistence is disabled.');
}

const __dirnameResolved = path.resolve();
app.use(express.static(path.join(__dirnameResolved, 'public')));

// Multer in-memory storage for uploaded PDFs
const storage = multer.memoryStorage();
const upload = multer({ storage });

app.get('/api/health', async (_req, res) => {
  const db = mongoose.connection?.readyState;
  const dbState = (db === 1) ? 'connected' : (db === 2) ? 'connecting' : (db === 0) ? 'disconnected' : 'unknown';
  res.json({ status: 'ok', time: new Date().toISOString(), db: dbState });
});

// Analyze an uploaded RFP PDF and return structured JSON per required schema (legacy, no persistence)
app.post('/api/analyze', upload.single('rfp'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Use field name "rfp".' });
    }

    const data = await pdfParse(req.file.buffer);
    const text = data.text || '';
    const parsed = parseRfp(text);

    res.json({
      filename: req.file.originalname,
      meta: {
        numPages: data.numpages,
        info: data.info || {},
      },
      extractedText: text,
      parsed,
    });
  } catch (err) {
    console.error('Analyze error:', err?.message);
    res.status(500).json({ error: 'Failed to analyze PDF.' });
  }
});

// MERN: Create an RFP (upload+analyze) and persist
app.post('/api/rfps', upload.single('rfp'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Use field name "rfp".' });
    }
    if (!MONGO_URI) return res.status(500).json({ error: 'Persistence disabled: set MONGO_URI.' });

    const data = await pdfParse(req.file.buffer);
    const text = data.text || '';
    const parsed = parseRfp(text);
    const hash = crypto.createHash('sha256').update(text).digest('hex');

    const doc = await Rfp.create({
      original_filename: req.file.originalname,
      uploadMeta: { numPages: data.numpages, info: data.info || {} },
      extractedText: text,
      extractedTextHash: hash,
      parsedRequirements: parsed,
    });

    res.status(201).json(doc);
  } catch (err) {
    console.error('RFP create error:', err?.message);
    res.status(500).json({ error: 'Failed to create RFP.' });
  }
});

// MERN: list RFPs (lightweight)
app.get('/api/rfps', async (_req, res) => {
  try {
    if (!MONGO_URI) return res.json([]);
    const list = await Rfp.find({}, { extractedText: 0 }).sort({ createdAt: -1 }).lean();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list RFPs.' });
  }
});

// MERN: get RFP by id
app.get('/api/rfps/:id', async (req, res) => {
  try {
    if (!MONGO_URI) return res.status(404).json({ error: 'Not found' });
    const doc = await Rfp.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch RFP.' });
  }
});

// Generate keywords using Gemini based on project goal/summary and the RFP text (legacy)
app.post('/api/keywords', async (req, res) => {
  try {
    const { projectGoal, summary, rfpText } = req.body || {};
    if (!projectGoal && !summary) {
      return res.status(400).json({ error: 'Provide projectGoal and/or summary.' });
    }
    const safeRfpText = redactSensitive(rfpText || '');
    const safeGoal = redactSensitive(projectGoal || '');
    const safeSummary = redactSensitive(summary || '');
    const keywords = await generateKeywords({ projectGoal: safeGoal, summary: safeSummary, rfpText: safeRfpText });
    res.json({ keywords });
  } catch (err) {
    console.error('Keywords error:', err?.message);
    res.status(500).json({ error: 'Failed to generate keywords.' });
  }
});

// MERN: generate & persist keywords for a stored RFP
app.post('/api/rfps/:id/keywords', async (req, res) => {
  try {
    if (!MONGO_URI) return res.status(500).json({ error: 'Persistence disabled: set MONGO_URI.' });
    const { projectGoal = '', summary = '' } = req.body || {};
    if (!projectGoal && !summary) return res.status(400).json({ error: 'Provide projectGoal and/or summary.' });

    const rfp = await Rfp.findById(req.params.id);
    if (!rfp) return res.status(404).json({ error: 'RFP not found' });

    const safeRfpText = redactSensitive(rfp.extractedText || '');
    const safeGoal = redactSensitive(projectGoal || '');
    const safeSummary = redactSensitive(summary || '');
    const keywords = await generateKeywords({ projectGoal: safeGoal, summary: safeSummary, rfpText: safeRfpText });

    // attach suggestion history
    rfp.keywordSuggestions.push({
      keywords,
      promptContext: { projectGoal: safeGoal, summary: safeSummary },
      redacted_excerpt: safeRfpText.slice(0, 4000),
    });

    // also surface keywords on each requirement (display convenience)
    rfp.parsedRequirements = (rfp.parsedRequirements || []).map(r => ({
      ...r.toObject ? r.toObject() : r,
      keywords,
    }));

    await rfp.save();
    res.json({ keywords, rfp });
  } catch (err) {
    console.error('RFP keywords error:', err?.message);
    res.status(500).json({ error: 'Failed to generate keywords for RFP.' });
  }
});

// Proposals: create
app.post('/api/proposals', async (req, res) => {
  try {
    if (!MONGO_URI) return res.status(500).json({ error: 'Persistence disabled: set MONGO_URI.' });
    const { rfpId, formData = {}, attachments = [], status = 'draft' } = req.body || {};
    if (!rfpId) return res.status(400).json({ error: 'rfpId is required' });
    const proposal = await Proposal.create({ rfpId, formData, attachments, status });
    res.status(201).json(proposal);
  } catch (err) {
    console.error('Create proposal error:', err?.message);
    res.status(500).json({ error: 'Failed to create proposal.' });
  }
});

// Proposals: update
app.put('/api/proposals/:id', async (req, res) => {
  try {
    if (!MONGO_URI) return res.status(500).json({ error: 'Persistence disabled: set MONGO_URI.' });
    const { formData, attachments, status } = req.body || {};
    const updated = await Proposal.findByIdAndUpdate(
      req.params.id,
      { $set: { ...(formData !== undefined ? { formData } : {}), ...(attachments !== undefined ? { attachments } : {}), ...(status ? { status } : {}) } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Proposal not found' });
    res.json(updated);
  } catch (err) {
    console.error('Update proposal error:', err?.message);
    res.status(500).json({ error: 'Failed to update proposal.' });
  }
});

// Proposals: get by id
app.get('/api/proposals/:id', async (req, res) => {
  try {
    if (!MONGO_URI) return res.status(404).json({ error: 'Not found' });
    const doc = await Proposal.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch proposal.' });
  }
});

// Proposals: list by rfpId
app.get('/api/proposals', async (req, res) => {
  try {
    if (!MONGO_URI) return res.json([]);
    const { rfpId } = req.query;
    const q = rfpId ? { rfpId } : {};
    const list = await Proposal.find(q).sort({ updatedAt: -1 }).lean();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list proposals.' });
  }
});

// Fallback to index.html for root
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirnameResolved, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`SharkByte RFP app listening on http://localhost:${PORT}`);
});
