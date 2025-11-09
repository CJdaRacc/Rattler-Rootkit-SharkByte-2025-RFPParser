// Heuristic extractor for RFP intro sections (overview, executive summary, goals, introduction)
// Input: full extractedText (string)
// Output: { introType: string, introText: string }

export function extractRfpIntro(extractedText = ''){
  const text = String(extractedText || '');
  if (!text) return { introType: 'unknown', introText: '' };

  // Pre-normalize newlines and lightweight page hints
  const cleaned = text.replace(/\r\n/g, '\n');

  // Define candidate heading patterns (case-insensitive)
  const patterns = [
    { type: 'executive_summary', re: /^(?:\s*\d+\.?\s*)?(executive\s+summary)\b[\s\S]{0,1200}/im },
    { type: 'overview', re: /^(?:\s*\d+\.?\s*)?(overview|project\s+overview)\b[\s\S]{0,1200}/im },
    { type: 'goals', re: /^(?:\s*\d+\.?\s*)?(project\s+goals?|goals?\s*&?\s*objectives?)\b[\s\S]{0,1400}/im },
    { type: 'introduction', re: /^(?:\s*\d+\.?\s*)?(introduction|background)\b[\s\S]{0,1200}/im },
  ];

  for (const p of patterns){
    const m = cleaned.match(p.re);
    if (m) {
      const intro = m[0].trim();
      return { introType: p.type, introText: clampLength(intro, 6000) };
    }
  }

  // Fallback: take the first ~1.5 pages worth of text (approx by chars)
  const fallback = cleaned.slice(0, 5000).trim();
  return { introType: 'unknown', introText: fallback };
}

function clampLength(s, n){
  if (!s) return s;
  if (s.length <= n) return s;
  return s.slice(0, n);
}
