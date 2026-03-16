export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const catId = req.body && req.body.catId;
  const existingUrls = (req.body && req.body.existingUrls) || [];

  if (!catId) return res.status(400).json({ error: "Missing catId" });

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
- Must be a direct .csv or .xlsx download URL, OR a well-known open data portal page (Zenodo, Figshare, data.gov, Kaggle, GitHub raw) with a downloadable file
- No login required where possible (mark login true if account needed)
- Do NOT suggest: ${existingUrls.slice(0, 10).join(", ")}

Return ONLY a JSON array of 5 objects with exactly these keys:
"name" (string), "url" (string), "file_type" ("csv" or "xlsx"), "records" (string), "columns" (array of up to 10 strings), "source_org" (string), "login" (boolean)

No markdown. No explanation. Just the raw JSON array.`;

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not set", items: [] });
  }

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
        system: "You are a data archivist. Return ONLY a raw JSON array. No markdown, no explanation.",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(200).json({ error: `Anthropic API error: ${response.status} ${errText}`, items: [] });
    }

    const data = await response.json();
    const text = (data.content || []).map(b => b.text || "").join("");

    let s = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const a = s.indexOf("["), b = s.lastIndexOf("]");
    if (a !== -1 && b !== -1) s = s.slice(a, b + 1);

    let items = [];
    try { items = JSON.parse(s); } catch (_) { items = []; }

    return res.status(200).json({ items });
  } catch (err) {
    return res.status(200).json({ error: err.message, items: [] });
  }
}
