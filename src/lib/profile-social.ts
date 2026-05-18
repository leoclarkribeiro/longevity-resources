import { supabase } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

export type ProfileListEntry = Pick<Profile, "id" | "name" | "avatar_url">;

export type FollowCounts = {
  followers: number;
  following: number;
};

export async function fetchFollowCounts(userId: string): Promise<FollowCounts> {
  const [followersRes, followingRes] = await Promise.all([
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("following_id", userId),
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", userId)
  ]);

  return {
    followers: followersRes.count ?? 0,
    following: followingRes.count ?? 0
  };
}

async function hydrateProfiles(userIds: string[]): Promise<ProfileListEntry[]> {
  if (userIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id,name,avatar_url")
    .in("id", userIds);

  if (error) {
    throw error;
  }

  const byId = new Map((data ?? []).map((row) => [row.id as string, row as ProfileListEntry]));
  return userIds
    .map((id) => byId.get(id))
    .filter((profile): profile is ProfileListEntry => Boolean(profile));
}

export async function fetchFollowers(userId: string): Promise<ProfileListEntry[]> {
  const { data, error } = await supabase
    .from("follows")
    .select("follower_id, created_at")
    .eq("following_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const ids = (data ?? []).map((row) => row.follower_id as string);
  return hydrateProfiles(ids);
}

export async function fetchFollowing(userId: string): Promise<ProfileListEntry[]> {
  const { data, error } = await supabase
    .from("follows")
    .select("following_id, created_at")
    .eq("follower_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const ids = (data ?? []).map((row) => row.following_id as string);
  return hydrateProfiles(ids);
}

export function profileDisplayName(profile: ProfileListEntry): string {
  return profile.name?.trim() || "Contributor";
}
