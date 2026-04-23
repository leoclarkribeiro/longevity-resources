export const RESOURCE_CATEGORIES = [
  "video",
  "book",
  "podcast",
  "article",
  "services",
  "other"
] as const;

export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number];

/** Title-case labels for UI (matches design mock). */
export const CATEGORY_LABELS: Record<ResourceCategory, string> = {
  video: "Video",
  book: "Book",
  podcast: "Podcast",
  article: "Article",
  services: "Services",
  other: "Other"
};

export type AppUser = {
  id: string;
  email?: string;
  is_anonymous?: boolean;
};

export type Profile = {
  id: string;
  name: string | null;
  country: string | null;
  avatar_url: string | null;
};

export type ResourceRow = {
  id: string;
  name: string;
  link: string;
  category: ResourceCategory;
  description: string | null;
  thumbnail_url: string | null;
  created_at: string;
  created_by: string;
  is_guest_post: boolean;
  likes_count: number;
  profiles: Profile | null;
};
