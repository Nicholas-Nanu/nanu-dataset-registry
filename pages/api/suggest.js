// pages/api/suggest.js
// Server-side Claude API call to suggest new datasets — keeps API key off client
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { catId, existingUrls } = req.body;

  const topics = {
    uap: "UFO/UAP sightings or government UAP declassified records",
    nhi: "Non-Human Intelligence encounter or entity contact cases",
    cryptids: "cryptid or unknown animal sightings",
    paranormal: "paranormal, psychical research, or hauntings cases",
    consciousness: "near-death experiences, out-of-body experiences, or consciousness research",
    myths_history: "world mythology, folklore, or ancient history",
    ritual_occult: "witchcraft trials, occult traditions, or esoteric practices",
    natural_phenomena: "anomalous natural phenomena, geophysical events, or atmospheric anomalies",
    fortean: "Fortean or unexplained anomalous phenomena",
  };

  const prompt = `Find 5 real, publicly accessible CSV or XLSX dataset files about ${topics[catId] || catId}.
Requirements:
- Must be a direct .csv or .xlsx download URL, OR a known open data portal page (Zenodo, Figshare, data.gov, Kaggle, GitHub raw) with a downloadable file
- No login required where possible (mark login:true if account needed)
- Do NOT suggest these URLs: ${(existingUrls || []).slice(0, 15).join(", ")}

Return ONLY a JSON array of 5 objects with keys:
"name" (string), "url" (string), "file_type" ("csv" or "xlsx"), "records" (string e.g. "~5,000"), "columns" (array of up to 10 column name strings), "source_org" (string), "login" (boolean)

No markdown. No explanation. Just the raw JSON array.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        system: "You are a data archivist. Return ONLY a raw JSON array. No markdown, no explanation, no code fences.",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await response.json();
    const text = (data.content || []).map(b => b.text || "").join("");

    let s = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const a = s.indexOf("["), b2 = s.lastIndexOf("]");
    if (a !== -1 && b2 !== -1) s = s.slice(a, b2 + 1);
    let items = [];
    try { items = JSON.parse(s); } catch (_) {}
    return res.json({ items });
  } catch (err) {
    return res.status(500).json({ error: err.message, items: [] });
  }
}
