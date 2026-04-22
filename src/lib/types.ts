export const RESOURCE_CATEGORIES = [
  "video",
  "book",
  "podcast",
  "article",
  "services",
  "other"
] as const;

export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number];

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
  profiles: Profile[] | null;
};
