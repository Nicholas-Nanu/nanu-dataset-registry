// api/validate.js
// Checks whether a URL is live and returns size + content type
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "url param required" });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const r = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NanuBot/1.0)" },
    });
    clearTimeout(timer);

    const sizeBytes = r.headers.get("content-length");
    const contentType = r.headers.get("content-type") || "";

    return res.json({
      status: r.ok ? "live" : "dead",
      http_status: r.status,
      size_bytes: sizeBytes ? parseInt(sizeBytes) : null,
      size_label: sizeBytes ? formatSize(parseInt(sizeBytes)) : null,
      content_type: contentType,
    });
  } catch (err) {
    clearTimeout(timer);
    return res.json({
      status: "dead",
      error: err.name === "AbortError" ? "Timeout" : err.message,
    });
  }
}

function formatSize(bytes) {
  if (bytes > 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes > 1_000) return `${(bytes / 1_000).toFixed(0)} KB`;
  return `${bytes} B`;
}
