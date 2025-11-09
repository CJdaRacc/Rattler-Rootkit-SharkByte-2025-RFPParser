// Lightweight web search integration (Tavily or no-op)
// Exports: searchWeb({ query, maxResults }) => [{ title, snippet, url }]

const TAVILY_KEY = process.env.TAVILY_API_KEY || '';

export async function searchWeb({ query, maxResults = 6, timeoutMs = 1500 }){
  if (!TAVILY_KEY) return [];
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        api_key: TAVILY_KEY,
        query,
        search_depth: 'basic',
        include_answer: false,
        include_images: false,
        max_results: Math.min(10, Math.max(1, maxResults)),
      })
    });
    clearTimeout(to);
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    const items = Array.isArray(data.results) ? data.results : [];
    return items.map(x => ({
      title: String(x.title || '').slice(0, 200),
      snippet: String(x.snippet || '').slice(0, 600),
      url: String(x.url || ''),
    })).filter(x => x.title || x.snippet || x.url).slice(0, maxResults);
  } catch {
    try { clearTimeout(to); } catch {}
    return [];
  }
}
