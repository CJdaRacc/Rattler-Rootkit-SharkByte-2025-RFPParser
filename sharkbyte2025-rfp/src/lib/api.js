const BASE_URL = import.meta?.env?.VITE_API_URL || '';

function toUrl(path){
  if (!BASE_URL) return path; // relative to current origin (works with Vite proxy)
  if (path.startsWith('http')) return path;
  return BASE_URL.replace(/\/$/, '') + (path.startsWith('/') ? path : `/${path}`);
}

export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const url = toUrl(path);
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await safeJson(res);
    throw new Error(err?.error || `Request failed: ${res.status}`);
  }
  return safeJson(res);
}

async function safeJson(res) {
  try { return await res.json(); } catch { return null; }
}

export async function uploadFile(path, file, fieldName = 'rfp') {
  const fd = new FormData();
  fd.append(fieldName, file);
  const res = await fetch(path, { method: 'POST', body: fd, credentials: 'include' });
  if (!res.ok) {
    const err = await safeJson(res);
    throw new Error(err?.error || `Upload failed: ${res.status}`);
  }
  return safeJson(res);
}
