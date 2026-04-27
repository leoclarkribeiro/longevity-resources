import { NextRequest, NextResponse } from "next/server";
import { RESOURCE_CATEGORIES, ResourceCategory } from "@/lib/types";

type PreviewPayload = {
  title: string;
  description: string;
  category: ResourceCategory;
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
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<meta[^>]+(?:name|property)=["']${escapedKey}["'][^>]*content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const match = html.match(pattern);
  return match?.[1]?.trim() || null;
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
    const title = decodeHtmlEntities(getTitle(html) ?? "");
    const description = decodeHtmlEntities(
      getMetaContent(html, "og:description") ??
        getMetaContent(html, "description") ??
        getMetaContent(html, "twitter:description") ??
        ""
    );
    const inferredCategory = inferCategory(targetUrl.hostname, targetUrl.pathname, title, description);
    const category = CATEGORY_SET.has(inferredCategory) ? inferredCategory : FALLBACK_CATEGORY;

    const payload: PreviewPayload = {
      title,
      description,
      category
    };
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
      { error: "Unable to fetch metadata from this URL right now." },
      { status: 502 }
    );
  }
}
