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
    // Attempt to extract JSON array
    const jsonStart = text.indexOf('[');
    const jsonEnd = text.lastIndexOf(']');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const arr = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
      // Normalize: de-dup, lowercase, trim
      const uniq = Array.from(new Set(arr.map(x => String(x).toLowerCase().trim()))).filter(Boolean);
      return uniq;
    }
  } catch (e) {
    // fall through
  }
  // Fallback: split by commas
  const fallback = text
    .replace(/\n/g, ' ')
    .split(',')
    .map(x => x.toLowerCase().trim())
    .filter(Boolean);
  return Array.from(new Set(fallback)).slice(0, 20);
}
