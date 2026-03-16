// pages/api/headers.js
// Downloads the first chunk of a CSV or XLSX and returns column headers
import * as XLSX from "xlsx";

export const config = { api: { responseLimit: false } };

function parseCSVHeaders(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  // Handle quoted CSV
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
  if (req.method !== "POST") return res.status(405).end();
  const { url, file_type } = req.body;
  if (!url) return res.status(400).json({ error: "url required" });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Nanu-Dataset-Registry/1.0",
        "Range": "bytes=0-32767", // only fetch first 32KB
      },
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return res.json({ error: `HTTP ${response.status}`, columns: [] });
    }

    const buffer = await response.arrayBuffer();
    const ft = (file_type || "").toLowerCase();

    if (ft === "xlsx" || ft === "xls") {
      try {
        const wb = XLSX.read(buffer, { type: "array", sheetRows: 2 });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        const headers = rows[0] ? rows[0].map(String).filter(h => h.trim()).slice(0, 40) : [];
        return res.json({ columns: headers, rows_preview: rows.slice(0, 3) });
      } catch (e) {
        return res.json({ error: "Could not parse XLSX: " + e.message, columns: [] });
      }
    } else {
      // CSV
      const text = new TextDecoder().decode(buffer);
      const columns = parseCSVHeaders(text);
      return res.json({ columns });
    }
  } catch (err) {
    clearTimeout(timeout);
    return res.json({
      error: err.name === "AbortError" ? "Timeout fetching file" : err.message,
      columns: [],
    });
  }
}
