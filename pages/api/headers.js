import * as XLSX from "xlsx";

export const config = { api: { bodyParser: true, responseLimit: false } };

function parseCSVHeaders(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const first = lines[0];
  const cols = [];
  let cur = "", inQ = false;
  for (let i = 0; i < first.length; i++) {
    const ch = first[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === "," && !inQ) { cols.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  cols.push(cur.trim());
  return cols.filter(c => c.length > 0).slice(0, 40);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const url = req.body && req.body.url;
  const file_type = req.body && req.body.file_type;
  if (!url) return res.status(400).json({ error: "Missing url" });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "NanuDatasetRegistry/2.0",
        "Range": "bytes=0-49151", // first 48KB only
      },
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(200).json({ error: `HTTP ${response.status}`, columns: [] });
    }

    const buffer = await response.arrayBuffer();
    const ft = (file_type || "").toLowerCase();

    if (ft === "xlsx" || ft === "xls") {
      try {
        const wb = XLSX.read(buffer, { type: "array", sheetRows: 2 });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        const headers = rows[0]
          ? rows[0].map(String).filter(h => h.trim()).slice(0, 40)
          : [];
        return res.status(200).json({ columns: headers, source: "real" });
      } catch (e) {
        return res.status(200).json({ error: "Could not parse XLSX: " + e.message, columns: [] });
      }
    } else {
      const text = new TextDecoder().decode(buffer);
      const columns = parseCSVHeaders(text);
      return res.status(200).json({ columns, source: "real" });
    }
  } catch (err) {
    clearTimeout(timeout);
    return res.status(200).json({
      error: err.name === "AbortError" ? "Timeout" : err.message,
      columns: [],
    });
  }
}
