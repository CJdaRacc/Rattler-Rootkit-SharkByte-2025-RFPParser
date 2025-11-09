import express from 'express';
import multer from 'multer';
import cors from 'cors';
import dotenv from 'dotenv';
import pdfParse from 'pdf-parse';
import path from 'path';
import crypto from 'crypto';
import mongoose from 'mongoose';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import fs from 'fs';
import https from 'https';
import mammoth from 'mammoth';
import rateLimit from 'express-rate-limit';

import { parseRfp } from './src/parser.js';
import { generateKeywords } from './src/gemini.js';
import { redactSensitive } from './src/redact.js';
import { Rfp } from './src/models/Rfp.js';
import { Proposal } from './src/models/Proposal.js';
import { User } from './src/models/User.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const COOKIE_SECURE = String(process.env.COOKIE_SECURE || 'false') === 'true';

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'"],
      "style-src": ["'self'", 'https:', "'unsafe-inline'"],
      "img-src": ["'self'", 'data:'],
      "connect-src": ["'self'"],
      "font-src": ["'self'", 'https:'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(cookieParser());
// Allow comma-separated list of origins; default to common dev ports
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:3000')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
app.use('/api/', apiLimiter);

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
// Static file serving removed to keep server API-only. UI is served by Vite (dev) or a separate static host.

// Multer in-memory storage for uploaded files
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function setAuthCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function clearAuthCookie(res) {
  res.clearCookie('token', { path: '/' });
}

async function requireAuth(req, res, next) {
  try {
    const t = req.cookies?.token;
    if (!t) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = jwt.verify(t, JWT_SECRET);
    const user = await User.findById(decoded.uid).lean();
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    req.user = { _id: user._id, email: user.email, name: user.name };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

// Auth routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name = '', email = '', password = '', companyName = '' } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ error: 'Email already registered' });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email: email.toLowerCase(), passwordHash, companyName });
    const token = signToken({ uid: user._id.toString() });
    setAuthCookie(res, token);
    res.status(201).json({ id: user._id, name: user.name, email: user.email, companyName: user.companyName, tags: user.tags, businesses: user.businesses });
  } catch (e) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email = '', password = '' } = req.body || {};
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = signToken({ uid: user._id.toString() });
    setAuthCookie(res, token);
    res.json({ id: user._id, name: user.name, email: user.email, companyName: user.companyName, tags: user.tags, businesses: user.businesses });
  } catch (e) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.user._id).lean();
  res.json({ id: user._id, name: user.name, email: user.email, companyName: user.companyName, tags: user.tags, businesses: user.businesses });
});

app.put('/api/me', requireAuth, async (req, res) => {
  try {
    const { name, companyName, tags, businesses } = req.body || {};
    const update = {};
    if (typeof name === 'string') update.name = name;
    if (typeof companyName === 'string') update.companyName = companyName;
    if (Array.isArray(tags)) update.tags = tags.map(String).slice(0, 200);
    if (Array.isArray(businesses)) update.businesses = businesses;
    const user = await User.findByIdAndUpdate(req.user._id, { $set: update }, { new: true });
    res.json({ id: user._id, name: user.name, email: user.email, companyName: user.companyName, tags: user.tags, businesses: user.businesses });
  } catch (e) {
    res.status(500).json({ error: 'Update failed' });
  }
});

app.get('/api/health', async (_req, res) => {
  const db = mongoose.connection?.readyState;
  const dbState = (db === 1) ? 'connected' : (db === 2) ? 'connecting' : (db === 0) ? 'disconnected' : 'unknown';
  res.json({ status: 'ok', time: new Date().toISOString(), db: dbState });
});

async function extractTextFromUpload(file) {
  const name = (file?.originalname || '').toLowerCase();
  if (name.endsWith('.pdf')) {
    const data = await pdfParse(file.buffer);
    return { text: data.text || '', meta: { numPages: data.numpages, info: data.info || {} }, docType: 'pdf' };
  } else if (name.endsWith('.docx')) {
    const { value } = await mammoth.extractRawText({ buffer: file.buffer });
    return { text: value || '', meta: { numPages: null, info: {} }, docType: 'docx' };
  } else if (name.endsWith('.doc')) {
    // Legacy DOC: recommend converting client-side or via external service
    return { text: '', meta: { note: 'DOC not supported server-side; convert to DOCX or PDF.' }, docType: 'doc' };
  }
  // default attempt PDF parse
  const data = await pdfParse(file.buffer);
  return { text: data.text || '', meta: { numPages: data.numpages, info: data.info || {} }, docType: 'pdf' };
}

function computeAccuracyAndMissing(parsed, keywords = []) {
  const expected = ['Eligibility','Budget','Timeline','Evaluation','Compliance','Scope','Submission','General'];
  const presentCats = new Set(parsed.map(r => r.category));
  const missing = expected.filter(c => !presentCats.has(c));
  const catScore = (presentCats.size / expected.length);
  const kwScore = (keywords.length ? 0.1 : 0); // small boost if keywords present
  const accuracy = Math.round(Math.min(1, catScore + kwScore) * 100);
  return { accuracy, missingItems: missing };
}

// Analyze an uploaded RFP (PDF/DOCX/DOC) and return structured JSON per required schema (legacy, no persistence)
app.post('/api/analyze', upload.single('rfp'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Use field name "rfp".' });
    }
    const { text, meta, docType } = await extractTextFromUpload(req.file);
    const parsed = parseRfp(text);
    const { accuracy, missingItems } = computeAccuracyAndMissing(parsed, []);

    res.json({
      filename: req.file.originalname,
      meta: { ...meta, docType },
      extractedText: text,
      parsed,
      accuracy,
      missingItems,
    });
  } catch (err) {
    console.error('Analyze error:', err?.message);
    res.status(500).json({ error: 'Failed to analyze file.' });
  }
});

// MERN: Create an RFP (upload+analyze) and persist
app.post('/api/rfps', requireAuth, upload.single('rfp'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Use field name "rfp".' });
    }
    if (!MONGO_URI) return res.status(500).json({ error: 'Persistence disabled: set MONGO_URI.' });

    const { text, meta, docType } = await extractTextFromUpload(req.file);
    const parsed = parseRfp(text);
    const hash = crypto.createHash('sha256').update(text).digest('hex');
    const { accuracy, missingItems } = computeAccuracyAndMissing(parsed, []);

    const doc = await Rfp.create({
      userId: req.user._id,
      original_filename: req.file.originalname,
      docType,
      uploadMeta: meta,
      extractedText: text,
      extractedTextHash: hash,
      parsedRequirements: parsed,
      accuracy,
      missingItems,
      keywords: [],
      tags: [],
    });

    res.status(201).json(doc);
  } catch (err) {
    console.error('RFP create error:', err?.message);
    res.status(500).json({ error: 'Failed to create RFP.' });
  }
});

// MERN: list RFPs (lightweight)
app.get('/api/rfps', requireAuth, async (req, res) => {
  try {
    if (!MONGO_URI) return res.json([]);
    const list = await Rfp.find({ userId: req.user._id }, { extractedText: 0 }).sort({ createdAt: -1 }).lean();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list RFPs.' });
  }
});

// MERN: get RFP by id
app.get('/api/rfps/:id', requireAuth, async (req, res) => {
  try {
    if (!MONGO_URI) return res.status(404).json({ error: 'Not found' });
    const doc = await Rfp.findOne({ _id: req.params.id, userId: req.user._id }).lean();
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
app.post('/api/rfps/:id/keywords', requireAuth, async (req, res) => {
  try {
    if (!MONGO_URI) return res.status(500).json({ error: 'Persistence disabled: set MONGO_URI.' });
    const { projectGoal = '', summary = '' } = req.body || {};
    if (!projectGoal && !summary) return res.status(400).json({ error: 'Provide projectGoal and/or summary.' });

    const rfp = await Rfp.findOne({ _id: req.params.id, userId: req.user._id });
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

    // surface keywords top-level and on each requirement
    rfp.keywords = keywords;
    rfp.parsedRequirements = (rfp.parsedRequirements || []).map(r => ({
      ...r.toObject ? r.toObject() : r,
      keywords,
    }));

    // recompute accuracy with keywords boost
    const { accuracy, missingItems } = computeAccuracyAndMissing(rfp.parsedRequirements, keywords);
    rfp.accuracy = accuracy;
    rfp.missingItems = missingItems;

    await rfp.save();
    res.json({ keywords, rfp });
  } catch (err) {
    console.error('RFP keywords error:', err?.message);
    res.status(500).json({ error: 'Failed to generate keywords for RFP.' });
  }
});

// Proposals: create
app.post('/api/proposals', requireAuth, async (req, res) => {
  try {
    if (!MONGO_URI) return res.status(500).json({ error: 'Persistence disabled: set MONGO_URI.' });
    const { rfpId, formData = {}, attachments = [], status = 'draft' } = req.body || {};
    if (!rfpId) return res.status(400).json({ error: 'rfpId is required' });
    // ensure RFP belongs to user
    const rfp = await Rfp.findOne({ _id: rfpId, userId: req.user._id });
    if (!rfp) return res.status(403).json({ error: 'Forbidden' });
    const proposal = await Proposal.create({ userId: req.user._id, rfpId, formData, attachments, status });
    res.status(201).json(proposal);
  } catch (err) {
    console.error('Create proposal error:', err?.message);
    res.status(500).json({ error: 'Failed to create proposal.' });
  }
});

// Proposals: update
app.put('/api/proposals/:id', requireAuth, async (req, res) => {
  try {
    if (!MONGO_URI) return res.status(500).json({ error: 'Persistence disabled: set MONGO_URI.' });
    const { formData, attachments, status } = req.body || {};
    const updated = await Proposal.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
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
app.get('/api/proposals/:id', requireAuth, async (req, res) => {
  try {
    if (!MONGO_URI) return res.status(404).json({ error: 'Not found' });
    const doc = await Proposal.findOne({ _id: req.params.id, userId: req.user._id }).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch proposal.' });
  }
});

// Proposals: list (optionally by rfpId)
app.get('/api/proposals', requireAuth, async (req, res) => {
  try {
    if (!MONGO_URI) return res.json([]);
    const { rfpId } = req.query;
    const q = { userId: req.user._id, ...(rfpId ? { rfpId } : {}) };
    const list = await Proposal.find(q).sort({ updatedAt: -1 }).lean();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list proposals.' });
  }
});

// RFP tags update
app.put('/api/rfps/:id/tags', requireAuth, async (req, res) => {
  try {
    const { tags = [] } = req.body || {};
    const updated = await Rfp.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: { tags: (Array.isArray(tags) ? tags.map(String).slice(0, 200) : []) } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'RFP not found' });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: 'Failed to update tags' });
  }
});

// Suggestions for missing items via Gemini (document-anchored)
app.post('/api/rfps/:id/suggestions', requireAuth, async (req, res) => {
  try {
    const rfp = await Rfp.findOne({ _id: req.params.id, userId: req.user._id }).lean();
    if (!rfp) return res.status(404).json({ error: 'RFP not found' });
    const missing = rfp.missingItems || [];
    if (missing.length === 0) return res.json({ suggestions: {} });

    // Build compact parsed summary to provide concrete anchors for Gemini
    const parsedSummary = (rfp.parsedRequirements || []).slice(0, 120).map(r => ({
      id: r.id,
      title: r.title,
      category: r.category,
      due_date: Array.isArray(r.due_dates) && r.due_dates.length ? r.due_dates[0] : undefined,
      evidence: Array.isArray(r.evidence_required) && r.evidence_required.length ? r.evidence_required.slice(0, 3) : [],
      snippet: (r.text_snippet || '').slice(0, 240)
    }));

    // Load GOOD RFP rubric (with inline fallback)
    let rubric = null;
    try {
      const p = path.join(process.cwd(), 'samples', 'good-rfp-rubric.json');
      if (fs.existsSync(p)) {
        rubric = JSON.parse(fs.readFileSync(p, 'utf8'));
      }
    } catch {}
    if (!rubric) {
      rubric = {
        sections: [
          { key: 'Eligibility', elements: ['eligibility criteria', 'applicant qualifications', 'disqualifiers'] },
          { key: 'Executive Summary', elements: ['purpose', 'funding amount', 'beneficiaries'] },
          { key: 'Problem/Needs', elements: ['needs statement', 'evidence of need'] },
          { key: 'Goals & Objectives', elements: ['SMART goals', 'measurable objectives'] },
          { key: 'Scope/Activities', elements: ['work plan', 'deliverables', 'milestones'] },
          { key: 'Timeline/Milestones', elements: ['start/end dates', 'milestone dates'] },
          { key: 'Budget & Narrative', elements: ['line items', 'justification', 'caps/limits'] },
          { key: 'Organizational Capacity', elements: ['team roles', 'experience', 'governance'] },
          { key: 'Evaluation Plan', elements: ['KPIs', 'data collection', 'reporting cadence'] },
          { key: 'Outcomes/Impact', elements: ['outputs', 'outcomes', 'impact metrics'] },
          { key: 'Compliance/Submission', elements: ['format', 'deadlines', 'checklist'] },
          { key: 'Risk & Mitigation', elements: ['risks', 'mitigation steps'] }
        ]
      };
    }

    const redacted = redactSensitive(rfp.extractedText || '');
    const { generateMissingSuggestions } = await import('./src/gemini.js');
    const suggestions = await generateMissingSuggestions({
      missingCategories: missing,
      rfpText: redacted,
      parsedSummary,
      rubric
    });
    res.json({ suggestions });
  } catch (e) {
    console.error('Suggestions error:', e?.message);
    res.status(500).json({ error: 'Failed to generate suggestions' });
  }
});

// Generate half-complete template via Gemini from essentials
app.post('/api/templates/generate', requireAuth, async (req, res) => {
  try {
    const essentials = req.body?.essentials || {};
    const { generateTemplateFromEssentials } = await import('./src/gemini.js');
    const draft = await generateTemplateFromEssentials({ essentials });
    res.json({ draft });
  } catch (e) {
    res.status(500).json({ error: 'Failed to generate template' });
  }
});

// Export proposal to PDF/DOCX/XLSX (basic stubs)
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import ExcelJS from 'exceljs';

app.post('/api/export', requireAuth, async (req, res) => {
  try {
    const { format = 'pdf', title = 'Proposal', content = {} } = req.body || {};
    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${title}.pdf"`);
      const doc = new PDFDocument();
      doc.pipe(res);
      doc.fontSize(18).text(title, { underline: true });
      doc.moveDown();
      doc.fontSize(12).text(JSON.stringify(content, null, 2));
      doc.end();
      return;
    }
    if (format === 'docx') {
      const paragraphs = [new Paragraph({ children: [new TextRun({ text: title, bold: true, size: 32 })] })];
      paragraphs.push(new Paragraph(JSON.stringify(content, null, 2)));
      const d = new Document({ sections: [{ children: paragraphs }] });
      const buf = await Packer.toBuffer(d);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${title}.docx"`);
      return res.end(buf);
    }
    if (format === 'xlsx') {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Proposal');
      ws.addRow(['Key', 'Value']);
      for (const k of Object.keys(content || {})) {
        ws.addRow([k, typeof content[k] === 'object' ? JSON.stringify(content[k]) : String(content[k])]);
      }
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${title}.xlsx"`);
      await wb.xlsx.write(res);
      return res.end();
    }
    res.status(400).json({ error: 'Unsupported format' });
  } catch (e) {
    console.error('Export error:', e?.message);
    res.status(500).json({ error: 'Failed to export' });
  }
});

// API-only root guidance
app.get('/', (_req, res) => {
  res.json({ ok: true, message: 'SharkByte RFP API server running. Use the Vite client on http://localhost:5173. Health: /api/health' });
});

// 404 for non-API routes (keep API errors handled by each route)
app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not Found', hint: 'This server only exposes /api/* endpoints. Run the UI via Vite on http://localhost:5173.' });
  }
  next();
});

function startServer() {
  const keyPath = process.env.SSL_KEY_PATH;
  const certPath = process.env.SSL_CERT_PATH;
  if (keyPath && certPath) {
    try {
      const key = fs.readFileSync(keyPath);
      const cert = fs.readFileSync(certPath);
      https.createServer({ key, cert }, app).listen(PORT, () => {
        console.log(`HTTPS server listening on https://localhost:${PORT}`);
      });
      return;
    } catch (e) {
      console.warn('Failed to start HTTPS, falling back to HTTP:', e?.message);
    }
  }
  app.listen(PORT, () => {
    console.log(`HTTP server listening on http://localhost:${PORT}`);
  });
}

startServer();
