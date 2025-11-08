import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = process.env.GEMINI_API_KEY;
let client = null;

function getClient() {
  if (!client) {
    if (!API_KEY) return null;
    client = new GoogleGenerativeAI(API_KEY);
  }
  return client;
}

export async function generateKeywordsFromSummary({ summary, goal }) {
  // Returns an array of keywords. If no API key, returns heuristic defaults.
  const redacted = `${goal ? `Goal: ${goal}\n` : ''}Summary: ${summary}`.slice(0, 8000);
  const c = getClient();
  if (!c) {
    // Fallback: simple noun-ish keywords via regex/splitting
    const words = (redacted || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 4);
    const freq = {};
    for (const w of words) freq[w] = (freq[w] || 0) + 1;
    return Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0, 12).map(([w])=>w);
  }
  const model = c.getGenerativeModel({ model: process.env.GEMINI_MODEL_FAST || 'gemini-1.5-flash', systemInstruction: 'You are a proposal analyst. Extract 15-25 SEO-style keywords and keyphrases suitable for similar business grant proposals based on the goal and summary. Return JSON only: {"keywords": string[]}. Keep terms concise (1-3 words). No PII.' });
  const res = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: redacted }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
  });
  try {
    const text = res?.response?.text?.() || '{}';
    const parsed = JSON.parse(text);
    const kws = Array.isArray(parsed.keywords) ? parsed.keywords : [];
    return kws.filter(Boolean).slice(0, 30);
  } catch {
    return [];
  }
}
