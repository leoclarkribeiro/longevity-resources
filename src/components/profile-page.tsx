"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { missingSupabaseEnv, supabase } from "@/lib/supabase/client";
import { Profile, ResourceRow } from "@/lib/types";
import ProfileHeaderView, { profileDisplayName } from "@/components/profile-header-view";
import ResourceCard, { type ResourceCardData } from "@/components/resource-card";
import { useAuthUser } from "@/lib/use-auth-user";

type ProfilePageProps = {
  userId: string;
};

type ProfileResourceRow = Omit<ResourceRow, "profiles">;

export default function ProfilePage({ userId }: ProfilePageProps) {
  const { user, ready } = useAuthUser();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [resources, setResources] = useState<ProfileResourceRow[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [statsRefreshKey, setStatsRefreshKey] = useState(0);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const isOwnProfile = Boolean(ready && user && !user.is_anonymous && user.id === userId);
  const canSocialAct = Boolean(user && !user.is_anonymous);

  useEffect(() => {
    if (missingSupabaseEnv) {
      setMessage(
        "Missing Supabase env vars. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
      );
      setLoading(false);
      return;
    }

    async function loadData() {
      setLoading(true);
      const [{ data: profileData, error: profileError }, { data: resourceData, error: resourceError }] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("id,name,country,avatar_url")
            .eq("id", userId)
            .maybeSingle(),
          supabase
            .from("resources")
            .select(
              "id,name,link,category,description,date_published,thumbnail_url,created_at,created_by,is_guest_post,likes_count"
            )
            .eq("created_by", userId)
            .order("created_at", { ascending: false })
        ]);

      if (profileError || resourceError) {
        setMessage(profileError?.message || resourceError?.message || "Failed loading profile");
      }

      setProfile(profileData as Profile | null);
      setResources((resourceData ?? []) as ProfileResourceRow[]);
      setLoading(false);
    }

    void loadData();
  }, [userId]);

  useEffect(() => {
    if (missingSupabaseEnv || !canSocialAct || resources.length === 0) {
      setLikedIds(new Set());
      return;
    }

    async function loadLikes() {
      const resourceIds = resources.map((resource) => resource.id);
      const { data } = await supabase
        .from("resource_likes")
        .select("resource_id")
        .eq("user_id", user!.id)
        .in("resource_id", resourceIds);

      setLikedIds(new Set((data ?? []).map((row) => row.resource_id as string)));
    }

    void loadLikes();
  }, [resources, user, canSocialAct]);

  useEffect(() => {
    if (missingSupabaseEnv || !canSocialAct || isOwnProfile) {
      setIsFollowing(false);
      return;
    }

    async function loadFollowState() {
      const { data, error } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("follower_id", user!.id)
        .eq("following_id", userId)
        .maybeSingle();

      if (!error) {
        setIsFollowing(Boolean(data));
      }
    }

    void loadFollowState();
  }, [userId, user, canSocialAct, isOwnProfile]);

  async function handleToggleFollow() {
    if (missingSupabaseEnv || !canSocialAct || !user || isOwnProfile) {
      if (!canSocialAct) {
        setMessage("Follow is only available for registered users.");
      }
      return;
    }

    setFollowBusy(true);
    const alreadyFollowing = isFollowing;
    const request = alreadyFollowing
      ? supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", userId)
      : supabase.from("follows").insert({ follower_id: user.id, following_id: userId });

    const { error } = await request;
    setFollowBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setIsFollowing(!alreadyFollowing);
    setStatsRefreshKey((key) => key + 1);
    setMessage(alreadyFollowing ? "Unfollowed user." : "Now following user.");
  }

  async function handleToggleLike(resourceId: string) {
    if (!canSocialAct || !user) {
      return;
    }

    const alreadyLiked = likedIds.has(resourceId);
    const snapshotLiked = new Set(likedIds);
    const snapshotResources = resources;

    setLikedIds((prev) => {
      const next = new Set(prev);
      if (alreadyLiked) {
        next.delete(resourceId);
      } else {
        next.add(resourceId);
      }
      return next;
    });
    setResources((prev) =>
      prev.map((resource) =>
        resource.id !== resourceId
          ? resource
          : {
              ...resource,
              likes_count: alreadyLiked
                ? Math.max(0, resource.likes_count - 1)
                : resource.likes_count + 1
            }
      )
    );

    const request = alreadyLiked
      ? supabase.from("resource_likes").delete().eq("resource_id", resourceId).eq("user_id", user.id)
      : supabase.from("resource_likes").insert({ resource_id: resourceId, user_id: user.id });

    const { error } = await request;
    if (error) {
      setLikedIds(snapshotLiked);
      setResources(snapshotResources);
      setMessage(error.message);
    }
  }

  const authorName = profileDisplayName(profile);

  return (
    <main className="page">
      <section className="card">
        <p className="eyebrow">Profile</p>
        {loading && !profile ? (
          <p className="subtext">Loading profile…</p>
        ) : (
          <ProfileHeaderView
            profile={profile}
            userId={userId}
            email={isOwnProfile ? user?.email : undefined}
            statsRefreshKey={statsRefreshKey}
            actions={
              <>
                {!isOwnProfile ? (
                  <button
                    type="button"
                    className="btn-follow"
                    onClick={() => void handleToggleFollow()}
                    disabled={!canSocialAct || followBusy}
                    title={
                      canSocialAct
                        ? isFollowing
                          ? `Unfollow ${authorName}`
                          : `Follow ${authorName}`
                        : "Sign in with a full account to follow"
                    }
                  >
                    {isFollowing ? `Unfollow ${authorName}` : `Follow ${authorName}`}
                  </button>
                ) : null}
                <Link href="/" className="btn-peach btn-peach--outline">
                  Back to resources
                </Link>
                {isOwnProfile ? (
                  <Link href="/auth" className="btn-peach">
                    Edit profile
                  </Link>
                ) : null}
              </>
            }
          />
        )}
        {message ? <p className="status">{message}</p> : null}
      </section>

      <section className="card">
        <h2 className="font-serif">Contributions</h2>
        {loading ? <p className="subtext">Loading contributions…</p> : null}
        {!loading && resources.length === 0 ? (
          <p className="subtext">No contributions yet.</p>
        ) : null}
        {!loading && resources.length > 0 ? (
          <ul className="resource-cards">
            {resources.map((resource) => (
              <ResourceCard
                key={resource.id}
                resource={resource as ResourceCardData}
                authorName={authorName}
                isLiked={likedIds.has(resource.id)}
                isOwner={isOwnProfile}
                canSocialAct={canSocialAct}
                showAuthor={false}
                showFollow={false}
                onToggleLike={() => void handleToggleLike(resource.id)}
              />
            ))}
          </ul>
        ) : null}
      </section>
    </main>
  );
}
