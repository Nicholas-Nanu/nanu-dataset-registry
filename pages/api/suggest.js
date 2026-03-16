export const config = { api: { bodyParser: true } };

// ── Platform-specific prompt builders ────────────────────────────────────────
// Each platform has a strict URL format we can validate before returning results.
// We never ask for general URLs — only formats we can structurally verify.

const TOPICS = {
  uap:               "UFO sightings, UAP reports, government UFO declassified records",
  nhi:               "non-human intelligence encounters, alien contact cases, entity encounter reports",
  cryptids:          "cryptid sightings, Bigfoot reports, unknown animal encounters, cryptozoology",
  paranormal:        "paranormal events, ghost sightings, psychical research, hauntings",
  consciousness:     "near-death experiences, out-of-body experiences, consciousness research, NDE",
  myths_history:     "world mythology, folklore, ancient history, oral traditions",
  ritual_occult:     "witchcraft, occult practices, esoteric traditions, religious rituals",
  natural_phenomena: "anomalous natural phenomena, geophysical events, atmospheric anomalies, meteors",
  fortean:           "Fortean phenomena, unexplained events, anomalous occurrences",
};

// Prompt for GitHub raw CSV/XLSX files only
function githubPrompt(topic, existingUrls) {
  return `List up to 5 real GitHub repositories that contain CSV or XLSX datasets about ${topic}.

For each one, provide the EXACT raw.githubusercontent.com URL to download the file directly.
The URL format must be: https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path/to/file.csv}

Rules:
- Only include repos you are highly confident actually exist
- Only include files you are highly confident are real CSV or XLSX files in that repo
- Do NOT invent URLs — only include ones you have strong knowledge of
- Do NOT include these already-known URLs: ${existingUrls.slice(0, 8).join(", ")}

Return ONLY a JSON array. Each object has exactly these keys:
"name" (string - descriptive name), "url" (string - full raw.githubusercontent.com URL), "file_type" ("csv" or "xlsx"), "records" (string estimate e.g. "~5,000"), "columns" (array of up to 8 known column name strings), "source_org" (string - who created the data), "login" (false)

No markdown. No explanation. Just the raw JSON array. If you cannot confidently name any real repos, return [].`;
}

// Prompt for Zenodo records only
function zenodoPrompt(topic, existingUrls) {
  return `List up to 5 real Zenodo records that contain CSV or XLSX datasets about ${topic}.

For each one, provide the EXACT Zenodo record URL in the format: https://zenodo.org/record/{RECORD_ID}
Or the direct file download: https://zenodo.org/record/{RECORD_ID}/files/{filename.csv}

Rules:
- Only include Zenodo records you are highly confident actually exist with that record ID
- Zenodo record IDs are 5-8 digit numbers
- Do NOT invent record IDs
- Do NOT include these already-known URLs: ${existingUrls.slice(0, 8).join(", ")}

Return ONLY a JSON array. Each object has exactly these keys:
"name" (string), "url" (string - zenodo.org URL), "file_type" ("csv" or "xlsx"), "records" (string), "columns" (array of up to 8 column strings), "source_org" (string), "login" (false)

No markdown. No explanation. Just the raw JSON array. If you cannot confidently name any real Zenodo records, return [].`;
}

// Prompt for Kaggle datasets only
function kagglePrompt(topic, existingUrls) {
  return `List up to 5 real Kaggle datasets that contain CSV or XLSX data about ${topic}.

For each one, provide the URL in the format: https://www.kaggle.com/datasets/{owner}/{dataset-slug}

Rules:
- Only include Kaggle datasets you are highly confident actually exist with that exact owner/slug
- Do NOT invent slugs
- Do NOT include these already-known URLs: ${existingUrls.slice(0, 8).join(", ")}

Return ONLY a JSON array. Each object has exactly these keys:
"name" (string), "url" (string - kaggle.com/datasets URL), "file_type" ("csv"), "records" (string), "columns" (array of up to 8 column strings), "source_org" (string), "login" (true)

No markdown. No explanation. Just the raw JSON array. If you cannot confidently name any real Kaggle datasets, return [].`;
}

// Prompt for data.gov / government open data portals
function govDataPrompt(topic, existingUrls) {
  return `List up to 3 real government or institutional open data portal datasets containing CSV data about ${topic}.

Acceptable sources: data.gov, data.europa.eu, data.world, Harvard Dataverse, OSF (osf.io), figshare.com

Rules:
- Only include datasets you are highly confident actually exist at that URL
- The URL must point to a real dataset page or direct CSV download
- Do NOT include these already-known URLs: ${existingUrls.slice(0, 8).join(", ")}

Return ONLY a JSON array. Each object has exactly these keys:
"name" (string), "url" (string), "file_type" ("csv" or "xlsx"), "records" (string), "columns" (array of up to 8 column strings), "source_org" (string), "login" (boolean)

No markdown. No explanation. Just the raw JSON array. If you cannot confidently name any real datasets, return [].`;
}

// ── JSON parser ───────────────────────────────────────────────────────────────
function parseJSON(text) {
  let s = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const a = s.indexOf("["), b = s.lastIndexOf("]");
  if (a === -1 || b === -1) return [];
  s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch (_) { return []; }
}

// ── URL structural validator ──────────────────────────────────────────────────
// Checks the URL is structurally valid for its claimed platform before returning
// it to the client. This catches obvious hallucinations like made-up GitHub paths.
function validateUrlStructure(item) {
  const url = item.url || "";

  // GitHub raw — must match exact pattern
  if (url.includes("raw.githubusercontent.com")) {
    const parts = url.replace("https://raw.githubusercontent.com/", "").split("/");
    if (parts.length < 4) return { ...item, structural_warning: "GitHub URL too short — may be invalid" };
    const ext = parts[parts.length - 1].split(".").pop().toLowerCase();
    if (!["csv","tsv","xlsx","xls"].includes(ext)) return { ...item, structural_warning: `Unexpected file extension: .${ext}` };
    return item;
  }

  // Zenodo — record ID must be numeric
  if (url.includes("zenodo.org")) {
    const match = url.match(/zenodo\.org\/record\/(\d+)/);
    if (!match) return { ...item, structural_warning: "Zenodo URL missing numeric record ID" };
    const id = parseInt(match[1], 10);
    if (id < 10000 || id > 99999999) return { ...item, structural_warning: `Zenodo record ID ${id} looks suspicious` };
    return item;
  }

  // Kaggle — must have owner/slug format
  if (url.includes("kaggle.com/datasets")) {
    const parts = url.replace(/^https?:\/\/www\.kaggle\.com\/datasets\/?/, "").split("/");
    if (parts.length < 2 || !parts[0] || !parts[1]) return { ...item, structural_warning: "Kaggle URL missing owner/slug" };
    return item;
  }

  // Everything else — pass through with a note
  return item;
}

// ── Claude API call ───────────────────────────────────────────────────────────
async function callClaude(prompt) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      system: "You are a research data archivist. You only return information you are highly confident is accurate. If you are not sure a dataset exists at a specific URL, return an empty array rather than guessing. Return ONLY raw JSON arrays.",
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${err}`);
  }

  const data = await res.json();
  return (data.content || []).map(b => b.text || "").join("");
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const catId       = req.body?.catId;
  const existingUrls= req.body?.existingUrls || [];
  const platform    = req.body?.platform || "github"; // "github" | "zenodo" | "kaggle" | "gov"

  if (!catId) return res.status(400).json({ error: "Missing catId" });

  const topic = TOPICS[catId] || catId;

  const promptMap = {
    github: githubPrompt(topic, existingUrls),
    zenodo: zenodoPrompt(topic, existingUrls),
    kaggle: kagglePrompt(topic, existingUrls),
    gov:    govDataPrompt(topic, existingUrls),
  };

  const prompt = promptMap[platform];
  if (!prompt) return res.status(400).json({ error: `Unknown platform: ${platform}` });

  try {
    const text  = await callClaude(prompt);
    const raw   = parseJSON(text);

    // Structurally validate each URL before sending to client
    const items = raw
      .filter(r => r.name && r.url && r.url.startsWith("http"))
      .map(r => validateUrlStructure({
        ...r,
        file_type: (r.file_type || "csv").toLowerCase(),
        login:     !!r.login,
        columns:   Array.isArray(r.columns) ? r.columns.slice(0, 10) : [],
        platform,  // tag which platform found this
      }));

    return res.status(200).json({ items, platform, count: items.length });
  } catch (err) {
    return res.status(200).json({ error: err.message, items: [], platform });
  }
}
