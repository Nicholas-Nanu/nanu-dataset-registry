export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const url = req.body && req.body.url;
  if (!url) return res.status(400).json({ error: "Missing url" });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      headers: { "User-Agent": "NanuDatasetRegistry/2.0" },
      redirect: "follow",
    });
    clearTimeout(timeout);

    const contentLength = response.headers.get("content-length");
    const sizeBytes = contentLength ? parseInt(contentLength, 10) : null;

    return res.status(200).json({
      status: response.ok ? "live" : "error",
      http_status: response.status,
      content_type: response.headers.get("content-type") || "",
      size_mb: sizeBytes ? (sizeBytes / 1024 / 1024).toFixed(2) : null,
    });
  } catch (err) {
    clearTimeout(timeout);
    return res.status(200).json({
      status: err.name === "AbortError" ? "timeout" : "dead",
      error: err.message,
    });
  }
}
