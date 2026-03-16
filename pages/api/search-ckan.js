export const config = { api: { bodyParser: true } };

// CKAN portals to search — all use the same standardised API
const CKAN_PORTALS = {
  "data.gov": {
    base:  "https://catalog.data.gov/api/3/action",
    label: "data.gov (USA)",
  },
  "data.gov.uk": {
    base:  "https://data.gov.uk/api/3/action",
    label: "data.gov.uk (UK)",
  },
  "data.europa.eu": {
    base:  "https://data.europa.eu/api/hub/search",
    label: "data.europa.eu (EU)",
    europeType: true, // uses different API schema
  },
  "open.canada.ca": {
    base:  "https://open.canada.ca/data/api/3/action",
    label: "open.canada.ca",
  },
};

const CKAN_QUERIES = {
  uap:               "ufo unidentified aerial phenomena",
  nhi:               "extraterrestrial anomalous phenomenon",
  cryptids:          "wildlife sightings animal unknown species",
  paranormal:        "anomalous phenomena unexplained events",
  consciousness:     "consciousness mental health wellbeing psychology",
  myths_history:     "folklore cultural heritage mythology history traditions",
  ritual_occult:     "historical records religious traditions cultural practices",
  natural_phenomena: "atmospheric phenomena geophysical natural disaster anomaly",
  fortean:           "unexplained phenomena anomalous natural events",
};

async function searchCKAN(portalKey, portal, query, rows = 10) {
  const items = [];

  if (portal.europeType) {
    // data.europa.eu uses a slightly different search endpoint
    const params = new URLSearchParams({
      q:       query,
      filter:  "format:CSV OR format:XLSX",
      limit:   String(rows),
      offset:  "0",
    });
    const res = await fetch(`${portal.base}/datasets?${params}`, {
      headers: { "Accept": "application/json", "User-Agent": "NanuDatasetRegistry/4.0" },
    });
    if (!res.ok) return items;
    const data = await res.json();
    const results = data.result?.results || data.results || [];
    for (const r of results.slice(0, rows)) {
      const resources = r.distributions || r.resources || [];
      const csvRes    = resources.find(f => ["csv","xlsx"].includes((f.format||"").toLowerCase()));
      if (!csvRes) continue;
      items.push({
        name:       r.title || r.name || "Untitled",
        url:        csvRes.accessURL || csvRes.downloadURL || csvRes.url || r.landingPage || "",
        file_type:  (csvRes.format || "csv").toLowerCase() === "xlsx" ? "xlsx" : "csv",
        records:    "unknown",
        columns:    [],
        source_org: r.publisher?.name || portal.label,
        login:      false,
        platform:   `ckan_${portalKey}`,
        portal:     portal.label,
        description:(r.description || "").slice(0, 120),
      });
    }
    return items;
  }

  // Standard CKAN API
  const params = new URLSearchParams({
    q:            query,
    fq:           "res_format:CSV OR res_format:XLSX OR res_format:csv OR res_format:xlsx",
    rows:         String(rows),
    start:        "0",
    sort:         "score desc",
  });

  const res = await fetch(`${portal.base}/package_search?${params}`, {
    headers: { "Accept": "application/json", "User-Agent": "NanuDatasetRegistry/4.0" },
  });

  if (!res.ok) return items;

  const data = await res.json();
  if (!data.success) return items;

  const results = data.result?.results || [];

  for (const pkg of results.slice(0, rows)) {
    const resources = pkg.resources || [];
    // Find CSV/XLSX resources
    const dataRes = resources.filter(r =>
      ["csv","xlsx","xls","tsv"].includes((r.format || r.mimetype || "").toLowerCase().replace("text/","").replace("application/",""))
    );
    if (dataRes.length === 0) continue;

    const primary = dataRes[0];
    const ext     = (primary.format || "csv").toLowerCase();

    items.push({
      name:        pkg.title || pkg.name || "Untitled",
      url:         primary.url || "",
      file_type:   ["xlsx","xls"].includes(ext) ? "xlsx" : "csv",
      records:     "unknown",
      columns:     [],
      source_org:  pkg.organization?.title || pkg.author || portal.label,
      login:       false,
      platform:    `ckan_${portalKey}`,
      portal:      portal.label,
      description: (pkg.notes || "").replace(/<[^>]+>/g, "").slice(0, 120),
      license:     pkg.license_title || "",
      all_resources: dataRes.length,
    });
  }

  return items;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { catId, portal = "data.gov" } = req.body;
  if (!catId) return res.status(400).json({ error: "Missing catId" });

  const portalConfig = CKAN_PORTALS[portal];
  if (!portalConfig) return res.status(400).json({ error: `Unknown portal: ${portal}. Valid: ${Object.keys(CKAN_PORTALS).join(", ")}` });

  const query = CKAN_QUERIES[catId] || catId;

  try {
    const items = await searchCKAN(portal, portalConfig, query, 10);
    return res.status(200).json({
      items,
      portal,
      portal_label: portalConfig.label,
      query,
      count: items.length,
    });
  } catch (err) {
    return res.status(200).json({ error: err.message, items: [], portal });
  }
}
