import { GoogleGenerativeAI } from "@google/generative-ai";

const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

function getClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY is not set');
  }
  return new GoogleGenerativeAI(key);
}

export async function generateKeywords({ projectGoal = '', summary = '', rfpText = '' }) {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const prompt = `You are assisting in preparing a grant proposal. Based on the project goal, a short summary, and redacted RFP text, propose a focused set of business-style keywords and phrases suitable for search and alignment (including sector, impact areas, compliance, and common grant tags). 

Return ONLY a JSON array of unique lowercase keyword strings, 8-20 items, no explanations.

project_goal:\n${projectGoal}\n\nsummary:\n${summary}\n\nredacted_rfp_excerpt:\n${rfpText.slice(0, 4000)}\n`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  try {
    const jsonStart = text.indexOf('[');
    const jsonEnd = text.lastIndexOf(']');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const arr = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
      const uniq = Array.from(new Set(arr.map(x => String(x).toLowerCase().trim()))).filter(Boolean);
      return uniq;
    }
  } catch (e) {}
  const fallback = text
    .replace(/\n/g, ' ')
    .split(',')
    .map(x => x.toLowerCase().trim())
    .filter(Boolean);
  return Array.from(new Set(fallback)).slice(0, 20);
}

export async function generateMissingSuggestions({ missingCategories = [], rfpText = '' }) {
  if (!missingCategories.length) return {};
  const genAI = getClient();
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });
  const prompt = `Grant proposal assistant: Provide brief, practical suggestions for the following missing sections in an RFP/proposal. Keep each suggestion at most 3 sentences.

Return ONLY a JSON object mapping each category to a short suggestion string. Categories: ${missingCategories.join(', ')}

Redacted RFP excerpt (may be empty):\n${rfpText.slice(0, 3000)}\n`;
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      const obj = JSON.parse(text.slice(start, end + 1));
      const out = {};
      for (const k of missingCategories) {
        if (obj[k]) out[k] = String(obj[k]).trim();
      }
      return out;
    }
  } catch {}
  const out = {};
  for (const k of missingCategories) out[k] = 'Provide a concise, outcomes-focused description tailored to the funder requirements.';
  return out;
}

export async function generateTemplateFromEssentials({ essentials = {} }) {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });
  const prompt = `Create a half-complete grant proposal template filled from the provided essentials. Keep language professional and concise. Return ONLY JSON with keys: cover, executive_summary, project_description { goals, scope, timeline }, budget { total, narrative }, capacity, evaluation, outcomes, compliance_submission { submission_format, due_dates, attachments }.

Essentials JSON:\n${JSON.stringify(essentials).slice(0, 6000)}\n`;
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      return JSON.parse(text.slice(start, end + 1));
    }
  } catch {}
  return { cover: {}, executive_summary: '', project_description: {}, budget: {}, capacity: '', evaluation: '', outcomes: '', compliance_submission: {} };
}
