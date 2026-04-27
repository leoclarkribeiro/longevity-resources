import { NextRequest, NextResponse } from "next/server";
import { RESOURCE_CATEGORIES, ResourceCategory } from "@/lib/types";

type PreviewPayload = {
  title: string;
  description: string;
  category: ResourceCategory;
  thumbnailUrl: string | null;
};

const FALLBACK_CATEGORY: ResourceCategory = "article";
const CATEGORY_SET = new Set<ResourceCategory>(RESOURCE_CATEGORIES);
const HOST_RULES: Array<{ category: ResourceCategory; hosts: string[] }> = [
  { category: "video", hosts: ["youtube.com", "youtu.be", "vimeo.com", "ted.com"] },
  {
    category: "podcast",
    hosts: ["spotify.com", "podcasts.apple.com", "open.spotify.com", "overcast.fm"]
  },
  {
    category: "book",
    hosts: ["goodreads.com", "amazon.com", "books.google.", "bookshop.org"]
  },
  { category: "article", hosts: ["medium.com", "substack.com", "pubmed.ncbi.nlm.nih.gov"] }
];

const CATEGORY_TERMS: Record<ResourceCategory, string[]> = {
  video: ["video", "watch", "webinar", "talk", "ted", "youtube", "vimeo", "lecture"],
  podcast: [
    "podcast",
    "episode",
    "listen",
    "spotify",
    "apple podcasts",
    "audio show",
    "show notes"
  ],
  book: [
    "book",
    "kindle",
    "hardcover",
    "paperback",
    "goodreads",
    "isbn",
    "audiobook"
  ],
  article: ["article", "blog", "newsletter", "paper", "journal", "study", "pubmed", "news"],
  services: [
    "service",
    "clinic",
    "consult",
    "coaching",
    "program",
    "membership",
    "appointment"
  ],
  other: []
};

function getMetaContent(html: string, key: string): string | null {
  const targetKey = key.toLowerCase();
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];

  for (const tag of metaTags) {
    const attrs: Record<string, string> = {};
    const attrPattern = /([^\s=]+)\s*=\s*["']([^"']*)["']/g;
    let attrMatch: RegExpExecArray | null = attrPattern.exec(tag);
    while (attrMatch) {
      attrs[attrMatch[1].toLowerCase()] = attrMatch[2];
      attrMatch = attrPattern.exec(tag);
    }

    const metaKey = (attrs.property ?? attrs.name ?? "").toLowerCase();
    if (metaKey !== targetKey) {
      continue;
    }

    const content = attrs.content?.trim();
    if (content) {
      return content;
    }
  }

  return null;
}

function getTitle(html: string): string | null {
  const ogTitle = getMetaContent(html, "og:title");
  if (ogTitle) {
    return ogTitle;
  }
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return titleMatch?.[1]?.trim() || null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function extractYouTubeVideoId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (host === "youtu.be") {
    const id = url.pathname.replace(/^\/+/, "").split("/")[0];
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  }
  if (!host.includes("youtube.com")) {
    return null;
  }
  const direct = url.searchParams.get("v");
  if (direct && /^[\w-]{11}$/.test(direct)) {
    return direct;
  }
  const parts = url.pathname.split("/").filter(Boolean);
  const shortsIdx = parts.indexOf("shorts");
  if (shortsIdx >= 0 && parts[shortsIdx + 1] && /^[\w-]{11}$/.test(parts[shortsIdx + 1])) {
    return parts[shortsIdx + 1];
  }
  const embedIdx = parts.indexOf("embed");
  if (embedIdx >= 0 && parts[embedIdx + 1] && /^[\w-]{11}$/.test(parts[embedIdx + 1])) {
    return parts[embedIdx + 1];
  }
  return null;
}

function looksGenericYouTubeMetadata(title: string, description: string): boolean {
  const normalizedTitle = title.trim().toLowerCase();
  const normalizedDescription = description.trim().toLowerCase();
  return (
    normalizedTitle === "youtube" ||
    normalizedTitle === "- youtube" ||
    normalizedDescription.includes("enjoy the videos and music you love")
  );
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function firstTwoSentences(value: string): string {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return "";
  }
  const parts = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (parts.length <= 2) {
    return normalized;
  }
  return `${parts[0]} ${parts[1]}`.trim();
}

function unescapeJsonString(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
}

function extractJsonLdDescription(html: string): string {
  const scripts = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) ?? [];
  for (const script of scripts) {
    const body = script
      .replace(/<script[^>]*>/i, "")
      .replace(/<\/script>/i, "")
      .trim();
    if (!body) {
      continue;
    }
    try {
      const data = JSON.parse(body) as
        | { description?: string; "@type"?: string }
        | Array<{ description?: string; "@type"?: string }>;
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item?.description?.trim()) {
          return firstTwoSentences(decodeHtmlEntities(item.description));
        }
      }
    } catch {
      // Keep scanning other json-ld scripts.
    }
  }
  return "";
}

function extractYouTubeShortDescription(html: string): string {
  const candidates = [
    /"shortDescription":"((?:[^"\\]|\\.)*)"/,
    /"description":{"simpleText":"((?:[^"\\]|\\.)*)"}/,
    /"attributedDescriptionBodyText":\{"content":"((?:[^"\\]|\\.)*)"/
  ];
  for (const pattern of candidates) {
    const match = html.match(pattern);
    if (!match?.[1]) {
      continue;
    }
    const decoded = unescapeJsonString(match[1]);
    const short = firstTwoSentences(decoded);
    if (short) {
      return short;
    }
  }
  return extractJsonLdDescription(html);
}

function toAbsoluteUrl(value: string | null, baseUrl: URL): string | null {
  if (!value) {
    return null;
  }
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

async function fetchYouTubeFallback(videoId: string): Promise<Partial<PreviewPayload>> {
  let title = "";
  let description = "";
  let thumbnailUrl: string | null = null;

  try {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}&hl=en`;
    const watchResponse = await fetch(watchUrl, {
      headers: {
        "user-agent": "LongevityResourcesBot/1.0 (+metadata preview)",
        accept: "text/html,application/xhtml+xml"
      },
      signal: AbortSignal.timeout(9000),
      redirect: "follow"
    });
    if (watchResponse.ok) {
      const watchHtml = await watchResponse.text();
      title = decodeHtmlEntities(getTitle(watchHtml) ?? title);
      const metaDescription = decodeHtmlEntities(
        getMetaContent(watchHtml, "og:description") ??
          getMetaContent(watchHtml, "description") ??
          getMetaContent(watchHtml, "twitter:description") ??
          description
      );
      const shortDescription = extractYouTubeShortDescription(watchHtml);
      description = shortDescription || metaDescription;
      thumbnailUrl = toAbsoluteUrl(
        decodeHtmlEntities(
          getMetaContent(watchHtml, "og:image") ??
            getMetaContent(watchHtml, "twitter:image") ??
            getMetaContent(watchHtml, "twitter:image:src") ??
            ""
        ),
        new URL(watchUrl)
      );
    }
  } catch {
    // Best-effort fallback path.
  }

  if (title && !looksGenericYouTubeMetadata(title, description)) {
    return { title, description: firstTwoSentences(description), thumbnailUrl };
  }

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      `https://youtu.be/${videoId}`
    )}&format=json`;
    const oembedResponse = await fetch(oembedUrl, {
      signal: AbortSignal.timeout(7000)
    });
    if (!oembedResponse.ok) {
      return { title, description, thumbnailUrl };
    }
    const oembed = (await oembedResponse.json()) as {
      title?: string;
      thumbnail_url?: string;
    };
    return {
      title: oembed.title?.trim() || title,
      description: firstTwoSentences(description),
      thumbnailUrl: oembed.thumbnail_url ?? thumbnailUrl
    };
  } catch {
    return { title, description: firstTwoSentences(description), thumbnailUrl };
  }
}

function inferCategory(
  hostname: string,
  pathname: string,
  title: string,
  description: string
): ResourceCategory {
  const normalizedHost = hostname.toLowerCase();

  for (const rule of HOST_RULES) {
    if (rule.hosts.some((host) => normalizedHost === host || normalizedHost.endsWith(`.${host}`))) {
      return rule.category;
    }
  }

  const haystack = `${title} ${description}`.toLowerCase();
  const scores: Record<ResourceCategory, number> = {
    video: 0,
    podcast: 0,
    book: 0,
    article: 0,
    services: 0,
    other: 0
  };

  (Object.keys(CATEGORY_TERMS) as ResourceCategory[]).forEach((category) => {
    const terms = CATEGORY_TERMS[category];
    for (const term of terms) {
      if (haystack.includes(term)) {
        scores[category] += 1;
      }
    }
  });

  if (/(^|\/)(watch|video|videos)(\/|$)/.test(pathname.toLowerCase()) || /\b(video|watch)\b/.test(haystack)) {
    scores.video += 2;
  }
  if (/\b(ep\.?|episode)\s*\d+/i.test(haystack)) {
    scores.podcast += 2;
  }
  if (/\b(chapter|isbn[-:\s]|author)\b/.test(haystack)) {
    scores.book += 2;
  }
  if (/\b(clinic|book now|schedule|telehealth)\b/.test(haystack)) {
    scores.services += 2;
  }

  let bestCategory: ResourceCategory = FALLBACK_CATEGORY;
  let bestScore = 0;
  for (const category of RESOURCE_CATEGORIES) {
    const score = scores[category];
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestScore > 0 ? bestCategory : FALLBACK_CATEGORY;
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url")?.trim();
  if (!rawUrl) {
    return NextResponse.json({ error: "Missing url query parameter." }, { status: 400 });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "Invalid URL." }, { status: 400 });
  }

  if (!["http:", "https:"].includes(targetUrl.protocol)) {
    return NextResponse.json({ error: "URL must use http or https." }, { status: 400 });
  }

  try {
    const response = await fetch(targetUrl.toString(), {
      headers: {
        "user-agent": "LongevityResourcesBot/1.0 (+metadata preview)",
        accept: "text/html,application/xhtml+xml"
      },
      signal: AbortSignal.timeout(9000),
      redirect: "follow"
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Could not fetch URL metadata (status ${response.status}).` },
        { status: 502 }
      );
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("text/html")) {
      return NextResponse.json(
        { error: "This link does not appear to be an HTML page." },
        { status: 400 }
      );
    }

    const html = await response.text();
    let title = decodeHtmlEntities(getTitle(html) ?? "");
    let description = decodeHtmlEntities(
      getMetaContent(html, "og:description") ??
        getMetaContent(html, "description") ??
        getMetaContent(html, "twitter:description") ??
        ""
    );
    let thumbnailUrl = toAbsoluteUrl(
      decodeHtmlEntities(
        getMetaContent(html, "og:image") ??
          getMetaContent(html, "twitter:image") ??
          getMetaContent(html, "twitter:image:src") ??
          ""
      ),
      targetUrl
    );

    const youtubeVideoId = extractYouTubeVideoId(targetUrl);
    if (youtubeVideoId) {
      const ytFallback = await fetchYouTubeFallback(youtubeVideoId);
      if (ytFallback.title?.trim()) {
        title = ytFallback.title.trim();
      }
      if (ytFallback.description?.trim()) {
        description = ytFallback.description.trim();
      }
      if (ytFallback.thumbnailUrl) {
        thumbnailUrl = ytFallback.thumbnailUrl;
      }
      if (!description.trim()) {
        description = `Watch "${title}" on YouTube.`;
      }
    }

    const inferredCategory = inferCategory(targetUrl.hostname, targetUrl.pathname, title, description);
    const category = CATEGORY_SET.has(inferredCategory) ? inferredCategory : FALLBACK_CATEGORY;

    const payload: PreviewPayload = {
      title,
      description,
      category,
      thumbnailUrl
    };
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
      { error: "Unable to fetch metadata from this URL right now." },
      { status: 502 }
    );
  }
}
