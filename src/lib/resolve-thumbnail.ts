/**
 * Derive a thumbnail image URL from a resource link (client or server).
 * Used when `thumbnail_url` is missing or edge resolution failed.
 */

function extractYouTubeVideoId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "");

  if (host === "youtu.be" || host === "www.youtu.be") {
    const id = url.pathname.replace(/^\//, "").split("/")[0];
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  }

  if (!host.includes("youtube.com")) {
    return null;
  }

  const v = url.searchParams.get("v");
  if (v && /^[\w-]{11}$/.test(v)) {
    return v;
  }

  const pathParts = url.pathname.split("/").filter(Boolean);
  const embedIdx = pathParts.indexOf("embed");
  if (embedIdx >= 0 && pathParts[embedIdx + 1]) {
    const id = pathParts[embedIdx + 1];
    return /^[\w-]{11}$/.test(id) ? id : null;
  }

  const shortsIdx = pathParts.indexOf("shorts");
  if (shortsIdx >= 0 && pathParts[shortsIdx + 1]) {
    const id = pathParts[shortsIdx + 1].split("?")[0];
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  }

  const liveIdx = pathParts.indexOf("live");
  if (liveIdx >= 0 && pathParts[liveIdx + 1]) {
    const id = pathParts[liveIdx + 1].split("?")[0];
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  }

  return null;
}

function normalizeIsbn(raw: string): string | null {
  const digits = raw.replace(/[^0-9Xx]/g, "");
  if (digits.length === 10 || digits.length === 13) {
    return digits.toUpperCase();
  }
  return null;
}

/**
 * Returns a direct image URL when the link pattern is known, otherwise null.
 */
export function resolveThumbnailFromUrl(link: string): string | null {
  const trimmed = link.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, "");

    const ytId = extractYouTubeVideoId(url);
    if (ytId) {
      return `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
    }

    if (host.includes("books.google.")) {
      const volumeId = url.searchParams.get("id");
      if (volumeId) {
        return `https://books.google.com/books/content?id=${encodeURIComponent(
          volumeId
        )}&printsec=frontcover&img=1&zoom=1&source=gbs_api`;
      }
    }

    if (host.includes("openlibrary.org")) {
      const isbnMatch = url.pathname.match(/\/isbn\/([0-9Xx-]+)/i);
      if (isbnMatch?.[1]) {
        const isbn = normalizeIsbn(isbnMatch[1]);
        if (isbn) {
          return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
        }
      }
      const olMatch = url.pathname.match(/\/books\/(OL[0-9]+[MW])/i);
      if (olMatch?.[1]) {
        return `https://covers.openlibrary.org/b/olid/${olMatch[1]}-L.jpg`;
      }
    }

    if (host.includes("amazon.") || host.includes("amzn.")) {
      const asinOrIsbn =
        url.pathname.match(/\/(?:dp|gp\/product|d)\/([0-9A-Z]{10}|[0-9X-]{10,17})/i)?.[1] ?? null;
      if (asinOrIsbn) {
        const isbn = normalizeIsbn(asinOrIsbn);
        if (isbn) {
          return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
        }
      }
    }

    if (host.includes("vimeo.com")) {
      const parts = url.pathname.split("/").filter(Boolean);
      const id =
        parts[0] === "channels" || parts[0] === "groups" || parts[0] === "user"
          ? null
          : parts[0];
      if (id && /^\d+$/.test(id)) {
        return `https://vumbnail.com/${id}.jpg`;
      }
    }
  } catch {
    return null;
  }

  return null;
}
