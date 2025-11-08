import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

export async function extractTextFromBuffer(buffer, fileType) {
  const ext = (fileType || '').toLowerCase();
  if (ext.includes('pdf')) {
    const data = await pdfParse(buffer);
    // include pageTexts as fallback
    return { text: data.text, metadata: { nPages: data.numpages } };
  }
  if (ext.includes('docx')) {
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value, metadata: {} };
  }
  // default plain text
  return { text: buffer.toString('utf8'), metadata: {} };
}

export function naiveSectionSplit(fullText) {
  const lines = fullText.split(/\r?\n/);
  const sections = [];
  let current = { title: 'Introduction', text: '' };
  const headingRegex = /^(\d+(?:\.\d+)*)\s+(.{3,})$/;
  for (const line of lines) {
    const m = line.match(headingRegex);
    if (m && current.text.trim().length > 0) {
      sections.push(current);
      current = { title: `${m[1]} ${m[2]}`.trim(), text: '' };
    } else if (m) {
      current = { title: `${m[1]} ${m[2]}`.trim(), text: '' };
    } else if (/^[A-Z][A-Z\s]{3,}$/.test(line.trim())) {
      // ALL CAPS heading
      if (current.text.trim().length > 0) sections.push(current);
      current = { title: line.trim(), text: '' };
    } else {
      current.text += line + '\n';
    }
  }
  if (current.text.trim().length > 0) sections.push(current);
  return sections.map((s, idx) => ({ index: idx, title: s.title, text: s.text }));
}
