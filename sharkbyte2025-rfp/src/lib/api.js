export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(path, {
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
