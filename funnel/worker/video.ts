/*
 * Byte ranges for the videos. Safari, and so every browser on an iPhone,
 * fetches video in pieces (Range: bytes=...) and won't play a file that comes
 * back whole. The static asset server always sends the whole file, so .mp4
 * requests run through the Worker first (run_worker_first in wrangler.jsonc),
 * which fetches the file and answers with just the bytes asked for.
 */

export type ByteRange = { start: number; end: number };

/**
 * The bytes a Range header asks for, inclusive. null means send the whole file
 * (no header, or a form we don't handle, like several ranges at once);
 * "unsatisfiable" means the range starts past the end of the file.
 */
export function parseRange(header: string | null, size: number): ByteRange | "unsatisfiable" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, from = "", to = ""] = match;
  if (from === "" && to === "") return null;
  if (from === "") {
    // A suffix range: the last N bytes.
    const length = Number(to);
    if (length === 0 || size === 0) return "unsatisfiable";
    return { start: Math.max(size - length, 0), end: size - 1 };
  }
  const start = Number(from);
  const end = to === "" ? size - 1 : Math.min(Number(to), size - 1);
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
}

export async function serveVideo(request: Request, assets: Fetcher): Promise<Response> {
  // Ask for the whole file; the asset server ignores Range anyway.
  const file = await assets.fetch(request.url, { method: request.method === "HEAD" ? "HEAD" : "GET" });
  if (!file.ok) return file;

  const headers = new Headers(file.headers);
  headers.set("Accept-Ranges", "bytes");
  if (request.method === "HEAD" || !request.headers.has("Range")) {
    return new Response(file.body, { status: file.status, headers });
  }

  const body = await file.arrayBuffer();
  headers.delete("Content-Length");
  const range = parseRange(request.headers.get("Range"), body.byteLength);
  if (range === null) return new Response(body, { status: 200, headers });
  if (range === "unsatisfiable") {
    headers.set("Content-Range", `bytes */${body.byteLength}`);
    return new Response(null, { status: 416, headers });
  }
  headers.set("Content-Range", `bytes ${range.start}-${range.end}/${body.byteLength}`);
  return new Response(body.slice(range.start, range.end + 1), { status: 206, headers });
}
