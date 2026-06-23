// Tavily — web research (1000 credits/bulan, ~33/hari).
// Return clean answer + sources, ideal untuk fact-checking & real-time info.

const TAVILY_URL = "https://api.tavily.com/search";

export const tavilySearch = async (env, query, options = {}) => {
  if (!env.TAVILY_API_KEY) throw new Error("TAVILY_API_KEY belum di-set");
  const res = await fetch(TAVILY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: env.TAVILY_API_KEY,
      query,
      search_depth: options.depth || "basic",     // basic = 1 credit, advanced = 2 credits
      include_answer: true,
      include_raw_content: false,
      max_results: options.max || 5,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Tavily ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  return {
    answer: data.answer || null,
    results: (data.results || []).map(r => ({
      title: r.title,
      url: r.url,
      content: (r.content || "").slice(0, 500),
      score: r.score,
    })),
  };
};
