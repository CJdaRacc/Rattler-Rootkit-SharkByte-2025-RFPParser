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
import { generateKeywords, generateAutoKeywords } from './src/gemini.js';
import { redactSensitive } from './src/redact.js';
import { Rfp } from './src/models/Rfp.js';
import { Proposal } from './src/models/Proposal.js';
import { User } from './src/models/User.js';
import { extractRfpIntro } from './src/utils/intro.js';
import { searchWeb } from './src/search.js';

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

// Reference guide (20-09aa) — load and cache in memory when enabled via REF_GUIDE
const REF_GUIDE = String(process.env.REF_GUIDE || '').toLowerCase();
let REF_PROFILE = null; // { sections: [{ key, elements: [] }], _source: '20-09aa' }
let REF_PROFILE_READY = false;

async function loadReferenceProfile() {
  if (REF_PROFILE_READY) return REF_PROFILE;
  try {
    // If REF_GUIDE is explicitly set to a different profile, skip.
    // If empty or set to case_mgmt_20-09aa, attempt to auto-load the 20-09aa reference.
    if (REF_GUIDE && REF_GUIDE !== 'case_mgmt_20-09aa') {
      REF_PROFILE_READY = true; // not enabled; treat as ready (null)
      return null;
    }
    const refPath = path.join(process.cwd(), 'samples', '20-09aa-rfp-for-case-management-software-final.pdf');
    if (!fs.existsSync(refPath)) {
      console.warn('[REF_GUIDE] Reference PDF not found at', refPath);
      REF_PROFILE_READY = true; return null;
    }
    const buf = fs.readFileSync(refPath);
    const data = await pdfParse(buf);
    const text = String(data.text || '');
    // Heuristic extraction of section headings
    const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const heads = [];
    const headRe = /^(?:\d+[\.)\-]\s*)?([A-Z][A-Z\s\-\/&]{3,})$/; // simple ALL-CAPS headings or numbered caps
    for (const ln of lines) {
      const m = ln.match(headRe);
      if (m) heads.push(m[1].replace(/\s+/g,' ').trim());
    }
    const uniqHeads = Array.from(new Set(heads)).slice(0, 80);
    // Map to canonical keys
    function norm(h){
      const s = h.toLowerCase();
      if (/(instruction|submittal|submission|compliance)/.test(s)) return 'Submission & Compliance';
      if (/(statement of work|scope|work plan|tasks|deliverables)/.test(s)) return 'Scope & Activities';
      if (/(deliverable|milestone|schedule|timeline)/.test(s)) return 'Timeline';
      if (/(evaluation|award|criteria|scoring)/.test(s)) return 'Evaluation';
      if (/(budget|pricing|cost)/.test(s)) return 'Budget';
      if (/(eligibility|qualification|vendor)/.test(s)) return 'Eligibility';
      if (/(executive summary|overview|background|purpose|introduction)/.test(s)) return 'Executive Summary';
      if (/(goals|objectives)/.test(s)) return 'Goals & Objectives';
      if (/(organization|capacity|experience|staff)/.test(s)) return 'Organizational Capacity';
      if (/(outcome|impact|results)/.test(s)) return 'Outcomes & Impact';
      if (/(risk|mitigation|security|assurance)/.test(s)) return 'Risk & Mitigation';
      if (/(terms|conditions|contract|insurance|bond)/.test(s)) return 'Terms & Conditions';
      if (/(appendix|attachment|forms|exhibit)/.test(s)) return 'Forms & Attachments';
      return null;
    }
    const canonOrder = [
      'Executive Summary','Eligibility','Goals & Objectives','Scope & Activities','Timeline','Budget','Organizational Capacity','Evaluation','Outcomes & Impact','Submission & Compliance','Terms & Conditions','Forms & Attachments'
    ];
    const found = new Set();
    for (const h of uniqHeads) {
      const k = norm(h);
      if (k) found.add(k);
    }
    const sections = Array.from(found.size ? found : new Set(canonOrder))
      .filter(Boolean)
      .sort((a,b)=> canonOrder.indexOf(a)-canonOrder.indexOf(b))
      .map(key => ({ key, elements: defaultElementsFor(key) }));

    REF_PROFILE = { sections, _source: '20-09aa' };
    REF_PROFILE_READY = true;
    console.log(`[REF_GUIDE] Loaded 20-09aa reference: ${data.numpages||'?'} pages, sections=`, sections.map(s=>s.key).join(', '));
  } catch (e) {
    console.warn('[REF_GUIDE] Failed to load reference:', e?.message);
    REF_PROFILE_READY = true; REF_PROFILE = null;
  }
  return REF_PROFILE;
}

function defaultElementsFor(key){
  switch (key) {
    case 'Submission & Compliance':
      return ['due date/time & timezone','submission portal/email','format & filename rules','UEI/SAM registrations','required signatures/forms','attachments checklist','page/word limits'];
    case 'Evaluation':
      return ['evaluation criteria','weights/scoring','review process','tie-break rules'];
    case 'Timeline':
      return ['start/end dates','milestones','dependencies','phases'];
    case 'Budget':
      return ['line items','caps/allowances','match/cost-share','narrative'];
    case 'Scope & Activities':
      return ['workstreams','deliverables','acceptance criteria'];
    case 'Goals & Objectives':
      return ['SMART objectives','outcomes linkage'];
    case 'Organizational Capacity':
      return ['key staff roles','experience','governance'];
    case 'Outcomes & Impact':
      return ['outputs vs outcomes','targets','impact narrative'];
    case 'Eligibility':
      return ['applicant qualifications','geography','disqualifiers'];
    case 'Terms & Conditions':
      return ['contract terms','insurance/bonding','compliance clauses'];
    case 'Forms & Attachments':
      return ['required forms','certifications','exhibits'];
    case 'Executive Summary':
      return ['purpose','beneficiaries','request'];
    default:
      return [];
  }
}

// Kick off loading in background (non-blocking)
loadReferenceProfile().catch(()=>{});

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
  // Use reference profile if loaded; otherwise fallback to legacy expected labels
  let expected = null;
  if (REF_PROFILE && Array.isArray(REF_PROFILE.sections) && REF_PROFILE.sections.length) {
    expected = REF_PROFILE.sections.map(s => s.key);
  } else {
    expected = ['Eligibility','Budget','Timeline','Evaluation','Submission & Compliance','Scope & Activities','Organizational Capacity','Outcomes & Impact','Risk & Mitigation'];
  }
  // Normalize present categories to our canonical set (simple aliasing)
  const alias = new Map([
    ['Compliance','Submission & Compliance'],
    ['Submission','Submission & Compliance'],
    ['Scope','Scope & Activities'],
    ['Scope/Activities','Scope & Activities'],
    ['Timeline/Milestones','Timeline'],
    ['Executive Summary','Executive Summary'],
    ['Problem/Needs','Eligibility'],
  ]);
  const presentCats = new Set((parsed || []).map(r => {
    let c = String(r.category || '').trim();
    if (alias.has(c)) return alias.get(c);
    return c;
  }));
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

// Auto keywords (no user input): uses intro extraction + optional web search + Gemini
const AUTO_KW_TTL_MIN = parseInt(process.env.AUTO_KEYWORDS_CACHE_TTL_MIN || '30', 10);
const autoKwCache = new Map(); // key: rfpId, value: { at: ms, result }

app.post('/api/rfps/:id/auto-keywords', requireAuth, async (req, res) => {
  try {
    if (!MONGO_URI) return res.status(500).json({ error: 'Persistence disabled: set MONGO_URI.' });
    const force = String(req.query.force || 'false') === 'true';
    const rfp = await Rfp.findOne({ _id: req.params.id, userId: req.user._id });
    if (!rfp) return res.status(404).json({ error: 'RFP not found' });

    // Cache check
    const cached = autoKwCache.get(String(rfp._id));
    if (!force && cached && (Date.now() - cached.at) < AUTO_KW_TTL_MIN * 60 * 1000) {
      return res.json(cached.result);
    }

    // Ensure intro fields
    let introType = rfp.introType || 'unknown';
    let introText = rfp.introText || '';
    if (!introText || introText.length < 200) {
      const ext = extractRfpIntro(rfp.extractedText || '');
      introType = ext.introType || 'unknown';
      introText = ext.introText || '';
      rfp.introType = introType;
      rfp.introText = introText;
    }

    // Redact before external use
    const safeIntro = redactSensitive(introText || '').slice(0, 6000);

    // Optional web search enrichment
    let webSnippets = [];
    try {
      const keyTerms = selectQueryTerms(safeIntro);
      const q = `${introType} ${keyTerms.join(' ')}`.slice(0, 240);
      webSnippets = await searchWeb({ query: q, maxResults: 6 }).catch(() => []);
    } catch {}

    // Generate auto keywords
    const detailed = await generateAutoKeywords({ introText: safeIntro, introType, webSnippets });
    const keywords = Array.from(new Set(detailed.map(k => String(k.term || '').toLowerCase().trim()))).filter(Boolean).slice(0, 30);

    // Persist on RFP
    rfp.keywords = keywords;
    rfp.keywordDetails = detailed;
    rfp.keywordSources = {
      provider: webSnippets.length ? 'tavily' : 'none',
      urls: webSnippets.slice(0,3).map(s => s.url).filter(Boolean),
      createdAt: new Date(),
    };

    // surface keywords onto requirements
    rfp.parsedRequirements = (rfp.parsedRequirements || []).map(r => ({
      ... (r.toObject ? r.toObject() : r),
      keywords,
    }));

    const { accuracy, missingItems } = computeAccuracyAndMissing(rfp.parsedRequirements, keywords);
    rfp.accuracy = accuracy;
    rfp.missingItems = missingItems;

    await rfp.save();

    const result = { rfp, keywords, sources: rfp.keywordSources };
    autoKwCache.set(String(rfp._id), { at: Date.now(), result });
    res.json(result);
  } catch (err) {
    console.error('Auto-keywords error:', err?.message);
    res.status(500).json({ error: 'Failed to generate auto-keywords.' });
  }
});

function selectQueryTerms(s){
  const t = String(s || '').toLowerCase();
  const tokens = t.replace(/[^a-z0-9\s\-]/g, ' ').split(/\s+/).filter(w => w.length > 3);
  const stop = new Set(['the','and','for','with','that','from','this','into','your','have','will','shall','must','should','would','could','their','about','under','were','been','being','which','while','than','then','over','such','each','only','also','because','within','without','across','between','among','after','before','during','until','again','more','most','some','any','other','same','both','very','grant','rfp','request','proposal','project','solution','vendor','contractor','provide','including','include','based','support','services','service','deliver','delivery','plan','plans','approach','section','page','pages']);
  const freq = new Map();
  for (const w of tokens){ if (!stop.has(w)) freq.set(w, (freq.get(w)||0)+1); }
  return Array.from(freq.entries()).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([w])=>w);
}

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

    // Prefer 20-09aa official reference profile if available; otherwise use GOOD RFP rubric
    let rubric = null;
    try {
      const ref = await loadReferenceProfile();
      if (ref && Array.isArray(ref.sections) && ref.sections.length) {
        rubric = { sections: ref.sections };
      }
    } catch {}
    if (!rubric) {
      try {
        const p = path.join(process.cwd(), 'samples', 'good-rfp-rubric.json');
        if (fs.existsSync(p)) {
          rubric = JSON.parse(fs.readFileSync(p, 'utf8'));
        }
      } catch {}
    }
    if (!rubric) {
      rubric = {
        sections: [
          { key: 'Eligibility', elements: ['eligibility criteria', 'applicant qualifications', 'disqualifiers'] },
          { key: 'Executive Summary', elements: ['purpose', 'funding amount', 'beneficiaries'] },
          { key: 'Goals & Objectives', elements: ['SMART goals', 'measurable objectives'] },
          { key: 'Scope & Activities', elements: ['work plan', 'deliverables', 'milestones'] },
          { key: 'Timeline', elements: ['start/end dates', 'milestone dates'] },
          { key: 'Budget', elements: ['line items', 'justification', 'caps/limits'] },
          { key: 'Organizational Capacity', elements: ['team roles', 'experience', 'governance'] },
          { key: 'Evaluation', elements: ['KPIs', 'data collection', 'reporting cadence'] },
          { key: 'Outcomes & Impact', elements: ['outputs', 'outcomes', 'impact metrics'] },
          { key: 'Submission & Compliance', elements: ['format', 'deadlines', 'checklist'] },
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
