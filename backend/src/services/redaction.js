// Simple PII redaction helpers for names, addresses, and company names.
// Heuristic, not bulletproof. Apply before sending any text to external LLMs.

const COMPANY_SUFFIXES = /(,?\s+(inc\.?|llc|l\.l\.c\.|corp\.?|co\.?|ltd\.?|plc|gmbh|s\.a\.|s\.r\.l\.|pty|ag))\b/i;

export function redactPII(input) {
  if (!input) return '';
  let t = input;
  // Emails
  t = t.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]');
  // Phone numbers
  t = t.replace(/\b(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '[REDACTED_PHONE]');
  // Addresses (very heuristic: number street, e.g., 123 Main St, 4567 Elm Avenue)
  t = t.replace(/\b\d{1,6}\s+[A-Za-z0-9'.\-]+\s+(Street|St\.|Road|Rd\.|Avenue|Ave\.|Boulevard|Blvd\.|Lane|Ln\.|Drive|Dr\.|Court|Ct\.|Way)\b/gi, '[REDACTED_ADDRESS]');
  // Company names: Words followed by company suffixes
  t = t.replace(new RegExp(`\n?([A-Z][A-Za-z&'\- ]{1,60})${COMPANY_SUFFIXES.source}`, 'g'), '[REDACTED_COMPANY]');
  // Person-like names: Two consecutive capitalized words (John Doe) not at sentence start (heuristic)
  t = t.replace(/\b([A-Z][a-z]{2,})\s+([A-Z][a-z]{2,})\b/g, (m, a, b) => {
    // Avoid common English words false positives by length
    if (a.length >= 3 && b.length >= 3) return '[REDACTED_NAME]';
    return m;
  });
  // Physical locations: City, ST zip (very rough)
  t = t.replace(/\b[A-Z][a-zA-Z]+,\s*[A-Z]{2}\s*\d{5}(-\d{4})?\b/g, '[REDACTED_LOCATION]');
  return t;
}

export function summarizeForLLM(text, maxChars = 3000) {
  // Lightweight summarization: first N chars of condensed text
  const condensed = (text || '').replace(/\s+/g, ' ').trim();
  return condensed.slice(0, maxChars);
}
