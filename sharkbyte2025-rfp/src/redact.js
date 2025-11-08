// Basic redaction utilities to remove PII-like tokens before sending to LLMs
// Note: Heuristic and not foolproof. Improves privacy but does not guarantee anonymity.

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_REGEX = /(\+?\d{1,3}[-.\s]?)?(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g;
const ADDRESS_REGEX = /(\d{1,6}[-\s]?[A-Za-z0-9]+\s+(Street|St\.|Road|Rd\.|Avenue|Ave\.|Boulevard|Blvd\.|Lane|Ln\.|Drive|Dr\.|Court|Ct\.|Way|Terrace|Ter\.)\b[^\n,]*)/gi;
// Company/Organization names (naive): Sequences of capitalized words followed by Inc|LLC|Ltd|Corporation|Corp
const COMPANY_REGEX = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(Inc\.|LLC|Ltd\.|Corporation|Corp\.)\b/g;
// Person names (very naive): two consecutive capitalized words not at sentence start
const PERSON_REGEX = /\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/g;

export function redactSensitive(input) {
  if (!input || typeof input !== 'string') return '';
  let out = input;
  out = out.replace(EMAIL_REGEX, '[REDACTED_EMAIL]');
  out = out.replace(PHONE_REGEX, '[REDACTED_PHONE]');
  out = out.replace(ADDRESS_REGEX, '[REDACTED_ADDRESS]');
  out = out.replace(COMPANY_REGEX, '[REDACTED_COMPANY]');
  // Only redact likely names that aren't common section headers
  out = out.replace(PERSON_REGEX, (m) => {
    const blacklist = ['Scope Of', 'Table Of', 'Statement Of', 'Request For', 'Terms And'];
    for (const b of blacklist) {
      if (m.startsWith(b)) return m;
    }
    return '[REDACTED_NAME]';
  });
  return out;
}
