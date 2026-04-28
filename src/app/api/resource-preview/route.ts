import { NextRequest, NextResponse } from "next/server";
import { RESOURCE_CATEGORIES, ResourceCategory } from "@/lib/types";

type PreviewPayload = {
  title: string;
  description: string;
  category: ResourceCategory;
  thumbnailUrl: string | null;
  publishedDate: string | null;
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

function toIsoDate(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const direct = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct?.[1]) {
    return direct[1];
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().slice(0, 10);
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

function isSpotifyHost(hostname: string): boolean {
  const host = hostname.replace(/^www\./, "").toLowerCase();
  return host === "open.spotify.com" || host.endsWith(".spotify.com");
}

function isAmazonHost(hostname: string): boolean {
  const host = hostname.replace(/^www\./, "").toLowerCase();
  return host.includes("amazon.");
}

function isSubstackHost(hostname: string): boolean {
  const host = hostname.replace(/^www\./, "").toLowerCase();
  return host === "substack.com" || host.endsWith(".substack.com");
}

function extractAmazonAsinOrIsbn(url: URL): string | null {
  const match =
    url.pathname.match(/\/(?:dp|gp\/product|d)\/([0-9A-Z]{10}|[0-9X-]{10,17})/i)?.[1] ?? null;
  return match ? match.toUpperCase() : null;
}

function extractTitleFromUrlSlug(url: URL): string {
  const slug = url.pathname
    .split("/")
    .filter(Boolean)
    .find((part) => /[a-z]/i.test(part) && !["dp", "gp", "product", "d"].includes(part.toLowerCase()));
  if (!slug) {
    return "";
  }
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractAmazonPublishedDateFromHtml(html: string): string | null {
  const plain = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ");
  const match = plain.match(
    /Publication date\s*[:\u200e\u200f\u202a-\u202e]*\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]+\s+\d{4}|\d{4})/i
  );
  if (!match?.[1]) {
    return null;
  }
  return toIsoDate(match[1]);
}

function stripHtmlTags(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
}

function extractAmazonTitleFromHtml(html: string): string {
  const titleFromId =
    html.match(/id=["']productTitle["'][^>]*>\s*([\s\S]*?)\s*<\/span>/i)?.[1] ?? "";
  if (titleFromId.trim()) {
    return normalizeWhitespace(stripHtmlTags(titleFromId));
  }

  const ogTitle = decodeHtmlEntities(getMetaContent(html, "og:title") ?? "").trim();
  if (ogTitle) {
    return ogTitle
      .replace(/\s*:\s*Amazon(?:\.[A-Za-z.]+)?\s*$/i, "")
      .replace(/\s*\|\s*Amazon(?:\.[A-Za-z.]+)?\s*$/i, "")
      .trim();
  }

  const pageTitle = decodeHtmlEntities(getTitle(html) ?? "").trim();
  return pageTitle
    .replace(/\s*:\s*Amazon(?:\.[A-Za-z.]+)?\s*$/i, "")
    .replace(/\s*\|\s*Amazon(?:\.[A-Za-z.]+)?\s*$/i, "")
    .trim();
}

function extractAmazonDescriptionFromHtml(html: string): string {
  const sectionCandidates = [
    /id=["']bookDescription_feature_div["'][\s\S]*?<noscript>([\s\S]*?)<\/noscript>/i,
    /id=["']bookDescription_feature_div["'][\s\S]*?<div[^>]*class=["'][^"']*a-expander-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /id=["']productDescription["'][\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i
  ];

  for (const pattern of sectionCandidates) {
    const match = html.match(pattern);
    if (!match?.[1]) {
      continue;
    }
    const cleaned = firstFourSentences(stripHtmlTags(match[1]));
    if (cleaned) {
      return cleaned;
    }
  }

  const metaDescription = decodeHtmlEntities(getMetaContent(html, "description") ?? "").trim();
  return metaDescription ? firstFourSentences(metaDescription) : "";
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

function looksGenericSpotifyDescription(description: string): boolean {
  const normalized = description.trim().toLowerCase();
  return (
    !normalized ||
    normalized === "spotify · episode" ||
    normalized.endsWith(" · episode") ||
    normalized.endsWith(" · song") ||
    normalized.endsWith(" · album") ||
    normalized.endsWith(" · playlist") ||
    normalized.includes("spotify · episode") ||
    normalized.includes("spotify · song") ||
    normalized.includes("spotify · album") ||
    normalized.includes("spotify · playlist")
  );
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function firstTwoSentences(value: string): string {
  return firstSentences(value, 2);
}

function firstSentences(value: string, sentenceCount: number): string {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return "";
  }
  const rawParts = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
  const parts: string[] = [];
  const nonTerminalAbbrev = new Set([
    "mr.",
    "mrs.",
    "ms.",
    "dr.",
    "prof.",
    "sr.",
    "jr.",
    "st.",
    "vs.",
    "etc.",
    "e.g.",
    "i.e."
  ]);

  for (const chunk of rawParts) {
    if (parts.length === 0) {
      parts.push(chunk);
      continue;
    }
    const prev = parts[parts.length - 1];
    const lastWord = prev.split(/\s+/).pop()?.toLowerCase() ?? "";
    if (nonTerminalAbbrev.has(lastWord)) {
      parts[parts.length - 1] = `${prev} ${chunk}`;
    } else {
      parts.push(chunk);
    }
  }

  if (parts.length <= sentenceCount) {
    return normalized;
  }
  return parts.slice(0, sentenceCount).join(" ").trim();
}

function firstFourSentences(value: string): string {
  return firstSentences(value, 4);
}

function looksTruncatedDescription(value: string): boolean {
  const normalized = normalizeWhitespace(value).toLowerCase();
  if (!normalized) {
    return true;
  }
  const trailingAbbrev = [
    "mr.",
    "mrs.",
    "ms.",
    "dr.",
    "prof.",
    "sr.",
    "jr.",
    "st."
  ];
  return trailingAbbrev.some((abbrev) => normalized.endsWith(abbrev));
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

function extractJsonLdPublishedDate(html: string): string | null {
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
        | { datePublished?: string; uploadDate?: string; dateCreated?: string }
        | Array<{ datePublished?: string; uploadDate?: string; dateCreated?: string }>;
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const normalized = toIsoDate(
          item?.datePublished ?? item?.uploadDate ?? item?.dateCreated ?? null
        );
        if (normalized) {
          return normalized;
        }
      }
    } catch {
      // Keep scanning other json-ld scripts.
    }
  }
  return null;
}

function extractEmbeddedPublishedDate(html: string): string | null {
  const keys = ["uploadDate", "publishDate", "datePublished", "dateCreated"];
  for (const key of keys) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = html.match(new RegExp(`"${escapedKey}"\\s*:\\s*"([^"]+)"`));
    const normalized = toIsoDate(match?.[1] ?? null);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function extractSpotifyDescriptionFromHtml(html: string): string {
  const raw = extractJsonLdDescription(html);
  if (!raw) {
    return "";
  }

  const withoutBoilerplate = raw.replace(
    /^listen to this (?:episode|podcast|song|album|playlist) from .*? on spotify\.?\s*/i,
    ""
  );
  return firstTwoSentences(withoutBoilerplate);
}

function extractSubstackLeadDescriptionFromHtml(html: string): string {
  const articleMatch = html.match(/<article[\s\S]*?<\/article>/i);
  if (!articleMatch) {
    return "";
  }
  const paragraphMatches = articleMatch[0].match(/<p[^>]*>[\s\S]*?<\/p>/gi) ?? [];
  const cleanedParagraphs = paragraphMatches
    .map((paragraph) =>
      normalizeWhitespace(
        decodeHtmlEntities(paragraph.replace(/<[^>]+>/g, " "))
      )
    )
    .filter((text) => text.length >= 60)
    .filter(
      (text) =>
        !/article voiceover|audio playback is not supported|subscribe|sign in/i.test(text)
    );

  if (cleanedParagraphs.length === 0) {
    return "";
  }

  return firstSentences(cleanedParagraphs.slice(0, 3).join(" "), 3);
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
  let publishedDate: string | null = null;

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
      publishedDate =
        toIsoDate(
          getMetaContent(watchHtml, "og:video:release_date") ??
            getMetaContent(watchHtml, "uploadDate") ??
            getMetaContent(watchHtml, "datePublished") ??
            ""
        ) ??
        extractJsonLdPublishedDate(watchHtml) ??
        extractEmbeddedPublishedDate(watchHtml);
    }
  } catch {
    // Best-effort fallback path.
  }

  if (title && !looksGenericYouTubeMetadata(title, description)) {
    return { title, description: firstTwoSentences(description), thumbnailUrl, publishedDate };
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
      thumbnailUrl: oembed.thumbnail_url ?? thumbnailUrl,
      publishedDate
    };
  } catch {
    return { title, description: firstTwoSentences(description), thumbnailUrl, publishedDate };
  }
}

async function fetchAmazonBookFallback(url: URL): Promise<Partial<PreviewPayload>> {
  const asinOrIsbn = extractAmazonAsinOrIsbn(url);
  const titleFromSlug = extractTitleFromUrlSlug(url);
  let title = titleFromSlug;
  let description = "";
  let publishedDate: string | null = null;
  let thumbnailUrl: string | null = null;

  if (!asinOrIsbn) {
    return { title, description, category: "book", publishedDate, thumbnailUrl };
  }

  if (/^[0-9A-Z]{10}$/i.test(asinOrIsbn)) {
    thumbnailUrl = `https://images-na.ssl-images-amazon.com/images/P/${asinOrIsbn}.01.LZZZZZZZ.jpg`;
  }

  const isbnLike = asinOrIsbn.replace(/[^0-9X]/gi, "");
  if (isbnLike.length !== 10 && isbnLike.length !== 13) {
    return { title, description, category: "book", publishedDate, thumbnailUrl };
  }

  if (!thumbnailUrl) {
    thumbnailUrl = `https://covers.openlibrary.org/b/isbn/${isbnLike}-L.jpg`;
  }

  try {
    const response = await fetch(`https://openlibrary.org/isbn/${encodeURIComponent(isbnLike)}.json`, {
      signal: AbortSignal.timeout(7000)
    });
    if (!response.ok) {
      return { title, description, category: "book", publishedDate, thumbnailUrl };
    }
    const data = (await response.json()) as {
      title?: string;
      description?: string | { value?: string };
      publish_date?: string;
      works?: Array<{ key?: string }>;
    };
    title = data.title?.trim() || title;
    if (typeof data.description === "string") {
      description = firstFourSentences(data.description);
    } else {
      description = firstFourSentences(data.description?.value ?? "");
    }
    publishedDate = toIsoDate(data.publish_date ?? null);

    if (!description && data.works?.[0]?.key) {
      try {
        const workResponse = await fetch(`https://openlibrary.org${data.works[0].key}.json`, {
          signal: AbortSignal.timeout(7000)
        });
        if (workResponse.ok) {
          const work = (await workResponse.json()) as {
            description?: string | { value?: string };
          };
          if (typeof work.description === "string") {
            description = firstFourSentences(work.description);
          } else {
            description = firstFourSentences(work.description?.value ?? "");
          }
        }
      } catch {
        // Best-effort fallback path.
      }
    }
  } catch {
    // Best-effort fallback path.
  }

  return { title, description, category: "book", publishedDate, thumbnailUrl };
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
    const amazonHost = isAmazonHost(targetUrl.hostname);
    const response = await fetch(targetUrl.toString(), {
      headers: {
        "user-agent": "LongevityResourcesBot/1.0 (+metadata preview)",
        accept: "text/html,application/xhtml+xml"
      },
      signal: AbortSignal.timeout(9000),
      redirect: "follow"
    });

    if (!response.ok) {
      if (amazonHost) {
        const fallback = await fetchAmazonBookFallback(targetUrl);
        const fallbackTitle = fallback.title?.trim() || extractTitleFromUrlSlug(targetUrl) || "Amazon book";
        return NextResponse.json({
          title: fallbackTitle,
          description: fallback.description ?? "",
          category: "book",
          thumbnailUrl: fallback.thumbnailUrl,
          publishedDate: fallback.publishedDate
        });
      }
      return NextResponse.json(
        { error: `Could not fetch URL metadata (status ${response.status}).` },
        { status: 502 }
      );
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("text/html")) {
      if (amazonHost) {
        const fallback = await fetchAmazonBookFallback(targetUrl);
        const fallbackTitle = fallback.title?.trim() || extractTitleFromUrlSlug(targetUrl) || "Amazon book";
        return NextResponse.json({
          title: fallbackTitle,
          description: fallback.description ?? "",
          category: "book",
          thumbnailUrl: fallback.thumbnailUrl,
          publishedDate: fallback.publishedDate
        });
      }
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
    let publishedDate =
      toIsoDate(
        getMetaContent(html, "article:published_time") ??
          getMetaContent(html, "og:published_time") ??
          getMetaContent(html, "publish_date") ??
          getMetaContent(html, "datePublished") ??
          getMetaContent(html, "parsely-pub-date") ??
          ""
      ) ?? extractJsonLdPublishedDate(html);

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
      if (ytFallback.publishedDate) {
        publishedDate = ytFallback.publishedDate;
      }
      if (!description.trim()) {
        description = `Watch "${title}" on YouTube.`;
      }
    } else if (isSpotifyHost(targetUrl.hostname)) {
      if (looksGenericSpotifyDescription(description)) {
        const spotifyDescription = extractSpotifyDescriptionFromHtml(html);
        if (spotifyDescription) {
          description = spotifyDescription;
        }
      }
    } else if (isSubstackHost(targetUrl.hostname)) {
      if (looksTruncatedDescription(description)) {
        const substackDescription = extractSubstackLeadDescriptionFromHtml(html);
        if (substackDescription) {
          description = substackDescription;
        }
      }
    } else if (amazonHost) {
      const amazonTitleFromHtml = extractAmazonTitleFromHtml(html);
      const amazonDescriptionFromHtml = extractAmazonDescriptionFromHtml(html);
      const amazonFallback = await fetchAmazonBookFallback(targetUrl);
      title = amazonTitleFromHtml || amazonFallback.title?.trim() || title;
      description = amazonDescriptionFromHtml || amazonFallback.description?.trim() || description;
      publishedDate =
        amazonFallback.publishedDate ?? publishedDate ?? extractAmazonPublishedDateFromHtml(html);
      thumbnailUrl = amazonFallback.thumbnailUrl ?? thumbnailUrl;
    }

    const inferredCategory = inferCategory(targetUrl.hostname, targetUrl.pathname, title, description);
    const category = amazonHost
      ? "book"
      : CATEGORY_SET.has(inferredCategory)
      ? inferredCategory
      : FALLBACK_CATEGORY;

    const payload: PreviewPayload = {
      title,
      description,
      category,
      thumbnailUrl,
      publishedDate
    };
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
      { error: "Unable to fetch metadata from this URL right now." },
      { status: 502 }
    );
  }
}
