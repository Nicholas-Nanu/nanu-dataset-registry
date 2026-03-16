// pages/api/validate.js
// Checks if a URL is reachable, returns status + content-type + file size
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "url required" });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      headers: { "User-Agent": "Nanu-Dataset-Registry/1.0" },
      redirect: "follow",
    });
    clearTimeout(timeout);
    const contentType = response.headers.get("content-type") || "";
    const contentLength = response.headers.get("content-length");
    const sizeBytes = contentLength ? parseInt(contentLength, 10) : null;
    const sizeMB = sizeBytes ? (sizeBytes / 1024 / 1024).toFixed(2) : null;
    return res.json({
      status: response.ok ? "live" : "error",
      http_status: response.status,
      content_type: contentType,
      size_mb: sizeMB,
      size_bytes: sizeBytes,
    });
  } catch (err) {
    clearTimeout(timeout);
    return res.json({
      status: err.name === "AbortError" ? "timeout" : "dead",
      error: err.message,
    });
  }
}
