// api/headers.js
// Downloads the first portion of a CSV or XLSX and returns real column names
import XLSX from "xlsx";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "url param required" });

  const isXlsx = /\.xlsx?$/i.test(url.split("?")[0]);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    const r = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NanuBot/1.0)",
        // Request only first 64KB to avoid downloading huge files
        Range: "bytes=0-65535",
      },
    });
    clearTimeout(timer);

    if (!r.ok && r.status !== 206) {
      return res.json({ error: `HTTP ${r.status}` });
    }

    if (isXlsx) {
      const buf = Buffer.from(await r.arrayBuffer());
      const wb = XLSX.read(buf, { type: "buffer", sheetRows: 4 });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      const columns = (rows[0] || []).map(String).filter(Boolean);
      const sample = rows.slice(1, 4).map(row =>
        columns.reduce((obj, col, i) => ({ ...obj, [col]: row[i] ?? "" }), {})
      );
      return res.json({ columns, sample, format: "xlsx" });
    } else {
      // CSV
      const text = await r.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 5);
      if (!lines.length) return res.json({ error: "Empty file" });

      const columns = parseCSVLine(lines[0]);
      const sample = lines.slice(1, 4).map(line => {
        const vals = parseCSVLine(line);
        return columns.reduce((obj, col, i) => ({ ...obj, [col]: vals[i] ?? "" }), {});
      });
      return res.json({ columns, sample, format: "csv" });
    }
  } catch (err) {
    clearTimeout(timer);
    return res.json({
      error: err.name === "AbortError" ? "Timeout fetching file" : err.message,
    });
  }
}

// Simple but handles quoted fields with commas inside them
function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, ""));
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim().replace(/^"|"$/g, ""));
  return result;
}
