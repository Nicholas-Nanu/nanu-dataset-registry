// api/suggest.js
// Calls Claude API server-side to find additional CSV/XLSX datasets
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { category, exclude = "" } = req.query;
  if (!category) return res.status(400).json({ error: "category param required" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set in environment variables" });

  const excludeList = exclude ? exclude.split(",").slice(0, 20) : [];

  const topics = {
    uap:               "UFO/UAP sightings or government declassified UAP/UFO records",
    nhi:               "Non-Human Intelligence encounter or entity contact cases",
    cryptids:          "cryptid or unknown animal sightings and cryptozoology research",
    paranormal:        "paranormal cases, psychical research, hauntings or ghost sightings",
    consciousness:     "near-death experiences, out-of-body experiences, or consciousness research",
    myths_history:     "world mythology, folklore, oral traditions, or ancient history",
    ritual_occult:     "witchcraft trials, occult traditions, or esoteric/ritual practices",
    natural_phenomena: "anomalous natural phenomena, geophysical events, or atmospheric anomalies",
    fortean:           "Fortean or unexplained anomalous phenomena",
  };

  const topic = topics[category] || category;
  const excludeNote = excludeList.length
    ? `Do NOT include datasets with these URLs: ${excludeList.join(", ")}.`
    : "";

  const prompt = `Find 5 real, publicly downloadable CSV or XLSX dataset files about ${topic}.

Rules:
- Must be a real file that actually exists and can be downloaded
- URL must end in .csv or .xlsx OR be a well-known open data portal (Zenodo, Figshare, data.gov, GitHub raw, Kaggle) with a known downloadable file
- Prefer no login required. If login is needed (e.g. Kaggle free account), set login to true
- Include realistic column names from the actual dataset
${excludeNote}

Return ONLY a JSON array of 5 objects with exactly these keys:
"name" (string), "url" (string), "file_type" ("csv" or "xlsx"), "records" (string e.g. "~5,000"), "columns" (array of up to 12 strings), "source_org" (string), "login" (boolean)

No markdown. No explanation. Just the raw JSON array.`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        system: "You are a data archivist. Return ONLY a raw JSON array with no markdown or explanation.",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await r.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const text = (data.content || []).map(b => b.text || "").join("");
    const s = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const a = s.indexOf("["), b = s.lastIndexOf("]");
    if (a === -1 || b === -1) return res.json({ datasets: [] });

    const datasets = JSON.parse(s.slice(a, b + 1));
    return res.json({ datasets: datasets.filter(d => d.name && d.url) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
