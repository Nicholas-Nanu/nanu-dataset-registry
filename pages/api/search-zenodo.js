export const config = { api: { bodyParser: true } };

// Zenodo category search keywords — tuned to return relevant datasets
const ZENODO_QUERIES = {
  uap:               "UFO sightings OR UAP reports OR unidentified aerial phenomena",
  nhi:               "non-human intelligence OR alien encounter OR extraterrestrial contact",
  cryptids:          "cryptid sightings OR bigfoot OR cryptozoology OR unknown animal",
  paranormal:        "paranormal OR psychical research OR ghost OR haunting OR parapsychology",
  consciousness:     "near death experience OR NDE OR out of body OR consciousness altered states",
  myths_history:     "mythology folklore OR ancient history OR oral tradition OR folk belief",
  ritual_occult:     "witchcraft OR occult OR esoteric OR ritual magic OR witch trial",
  natural_phenomena: "anomalous natural phenomena OR ball lightning OR atmospheric anomaly OR meteor fireball",
  fortean:           "Fortean phenomena OR anomalous events OR unexplained",
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { catId, page = 1 } = req.body;
  if (!catId) return res.status(400).json({ error: "Missing catId" });

  const q = ZENODO_QUERIES[catId] || catId;

  try {
    // Search Zenodo for datasets with CSV or XLSX files
    const params = new URLSearchParams({
      q,
      type:          "dataset",
      status:        "published",
      "sort":        "mostrecent",
      size:          "10",
      page:          String(page),
      "access_right":"open",
    });

    const searchRes = await fetch(`https://zenodo.org/api/records?${params}`, {
      headers: { "Accept": "application/json", "User-Agent": "NanuDatasetRegistry/4.0" },
    });

    if (!searchRes.ok) {
      return res.status(200).json({ error: `Zenodo API ${searchRes.status}`, items: [] });
    }

    const data = await searchRes.json();
    const hits = data.hits?.hits || [];

    const items = [];

    for (const hit of hits) {
      const files    = hit.files || [];
      const meta     = hit.metadata || {};
      const title    = meta.title || "Untitled";
      const creators = (meta.creators || []).map(c => c.name).slice(0, 2).join(", ");
      const recId    = hit.id || hit.record_id;
      const recUrl   = `https://zenodo.org/record/${recId}`;

      // Only include records that have CSV or XLSX files
      const dataFiles = files.filter(f => {
        const ext = (f.key || f.filename || "").split(".").pop().toLowerCase();
        return ["csv","xlsx","xls","tsv"].includes(ext);
      });

      if (dataFiles.length === 0) continue;

      // Pick the first usable data file
      const primaryFile = dataFiles[0];
      const ext         = (primaryFile.key || primaryFile.filename || "").split(".").pop().toLowerCase();
      const fileUrl     = primaryFile.links?.self || primaryFile.link || `${recUrl}/files/${primaryFile.key}`;

      items.push({
        name:        title,
        url:         fileUrl,
        record_url:  recUrl,
        file_type:   ext === "tsv" ? "csv" : (ext === "xls" ? "xlsx" : ext),
        records:     meta.relations?.version?.[0]?.count ? `~${meta.relations.version[0].count}` : "unknown",
        columns:     [],  // real columns fetched via /api/headers when user clicks COLS
        source_org:  creators || meta.publisher || "Zenodo",
        login:       false,
        platform:    "zenodo_live",
        doi:         meta.doi || "",
        description: (meta.description || "").replace(/<[^>]+>/g, "").slice(0, 120),
        all_files:   dataFiles.length,
      });
    }

    return res.status(200).json({
      items,
      total: data.hits?.total || 0,
      page,
      platform: "zenodo_live",
    });

  } catch (err) {
    return res.status(200).json({ error: err.message, items: [], platform: "zenodo_live" });
  }
}
