export const config = { api: { bodyParser: true } };

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

const PLATFORM_CONFIGS = {
  github: {
    label: "GitHub",
    instruction: `List up to 5 real GitHub repositories containing CSV or XLSX datasets.
URL format MUST be: https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path/to/file.csv}
Only include repos and files you are highly confident actually exist.
Set login to false.`,
  },
  zenodo: {
    label: "Zenodo",
    instruction: `List up to 5 real Zenodo records containing CSV or XLSX datasets.
URL format: https://zenodo.org/record/{RECORD_ID} or https://zenodo.org/record/{RECORD_ID}/files/{filename.csv}
Record IDs are 5-8 digit numbers. Only include records you are highly confident exist.
Set login to false.`,
  },
  kaggle: {
    label: "Kaggle",
    instruction: `List up to 5 real Kaggle datasets containing CSV data.
URL format MUST be: https://www.kaggle.com/datasets/{owner}/{dataset-slug}
Only include owner/slug combinations you are highly confident exist.
Set login to true.`,
  },
  gov: {
    label: "Gov/Inst",
    instruction: `List up to 3 real datasets from government or institutional open data portals (data.gov, data.europa.eu, data.world, OSF, figshare.com).
Only include URLs you are highly confident point to real downloadable datasets.`,
  },
  huggingface: {
    label: "Hugging Face",
    instruction: `List up to 5 real Hugging Face datasets containing tabular/CSV data.
URL format MUST be: https://huggingface.co/datasets/{owner}/{dataset-name}
For direct file access: https://huggingface.co/datasets/{owner}/{dataset-name}/resolve/main/{file.csv}
Only include datasets you are highly confident exist on Hugging Face.
Set login to false.`,
  },
  dataverse: {
    label: "Harvard Dataverse",
    instruction: `List up to 5 real Harvard Dataverse datasets containing CSV or tabular data.
URL format: https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:{DOI}
Or direct file: https://dataverse.harvard.edu/api/access/datafile/{FILE_ID}
Only include datasets you are highly confident exist with that DOI or file ID.
Set login to false.`,
  },
  osf: {
    label: "OSF",
    instruction: `List up to 5 real Open Science Framework (OSF) projects containing CSV or XLSX datasets.
URL format: https://osf.io/{5-char-id}/ for projects, or https://osf.io/download/{5-char-id}/ for files.
OSF IDs are exactly 5 alphanumeric characters.
Only include projects you are highly confident exist.
Set login to false.`,
  },
  mendeley: {
    label: "Mendeley",
    instruction: `List up to 5 real Mendeley Data datasets containing CSV or XLSX files.
URL format: https://data.mendeley.com/datasets/{slug}/{version}
Only include datasets you are highly confident exist with that exact slug and version number.
Set login to false.`,
  },
};

function buildPrompt(platform, topic, existingUrls) {
  const cfg = PLATFORM_CONFIGS[platform];
  return `Find datasets about: ${topic}

${cfg.instruction}

Do NOT include these already-known URLs: ${existingUrls.slice(0, 8).join(", ")}

Return ONLY a JSON array. Each object has exactly these keys:
"name" (string), "url" (string), "file_type" ("csv" or "xlsx"), "records" (string e.g. "~5,000"), "columns" (array of up to 8 column name strings), "source_org" (string), "login" (boolean)

IMPORTANT: If you are not highly confident a dataset exists at a specific URL, do not include it. Return [] rather than guessing.
No markdown. No explanation. Just the raw JSON array.`;
}

function parseJSON(text) {
  let s = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const a = s.indexOf("["), b = s.lastIndexOf("]");
  if (a === -1 || b === -1) return [];
  s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch (_) { return []; }
}

function validateStructure(item, platform) {
  const url = item.url || "";
  const warnings = [];

  if (platform === "github" && url.includes("raw.githubusercontent.com")) {
    const parts = url.replace("https://raw.githubusercontent.com/", "").split("/");
    if (parts.length < 4) warnings.push("URL path too short");
    const ext = parts[parts.length - 1]?.split(".").pop()?.toLowerCase();
    if (!["csv","tsv","xlsx","xls"].includes(ext)) warnings.push(`unexpected extension .${ext}`);
  }

  if (platform === "zenodo" && url.includes("zenodo.org")) {
    const match = url.match(/zenodo\.org\/record\/(\d+)/);
    if (!match) warnings.push("missing numeric record ID");
    else if (parseInt(match[1]) < 1000) warnings.push("record ID suspiciously low");
  }

  if (platform === "kaggle" && url.includes("kaggle.com/datasets")) {
    const parts = url.replace(/^https?:\/\/www\.kaggle\.com\/datasets\/?/, "").split("/");
    if (parts.length < 2 || !parts[0] || !parts[1]) warnings.push("missing owner/slug");
  }

  if (platform === "huggingface" && url.includes("huggingface.co/datasets")) {
    const parts = url.replace(/^https?:\/\/huggingface\.co\/datasets\/?/, "").split("/");
    if (parts.length < 2 || !parts[0] || !parts[1]) warnings.push("missing owner/name");
  }

  if (platform === "osf" && url.includes("osf.io")) {
    const match = url.match(/osf\.io\/([a-z0-9]{5})/i);
    if (!match) warnings.push("OSF ID should be 5 alphanumeric characters");
  }

  if (platform === "mendeley" && url.includes("data.mendeley.com")) {
    if (!url.includes("/datasets/")) warnings.push("missing /datasets/ in URL");
  }

  return warnings.length > 0
    ? { ...item, structural_warning: warnings.join("; ") }
    : item;
}

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
      system: "You are a research data archivist. Only return datasets you are highly confident exist. If uncertain, return []. Return ONLY raw JSON arrays with no markdown.",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
  const data = await res.json();
  return (data.content || []).map(b => b.text || "").join("");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { catId, existingUrls = [], platform = "github" } = req.body;
  if (!catId) return res.status(400).json({ error: "Missing catId" });
  if (!PLATFORM_CONFIGS[platform]) return res.status(400).json({ error: `Unknown platform: ${platform}` });

  const topic = TOPICS[catId] || catId;

  try {
    const text  = await callClaude(buildPrompt(platform, topic, existingUrls));
    const raw   = parseJSON(text);
    const items = raw
      .filter(r => r.name && r.url && r.url.startsWith("http"))
      .map(r => validateStructure({
        ...r,
        file_type: (r.file_type || "csv").toLowerCase(),
        login:     !!r.login,
        columns:   Array.isArray(r.columns) ? r.columns.slice(0, 10) : [],
        platform,
      }, platform));

    return res.status(200).json({ items, platform, count: items.length });
  } catch (err) {
    return res.status(200).json({ error: err.message, items: [], platform });
  }
}
