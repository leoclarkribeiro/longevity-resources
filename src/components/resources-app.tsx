"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { User } from "@supabase/supabase-js";
import Link from "next/link";
import { missingSupabaseEnv, supabase } from "@/lib/supabase/client";
import {
  AppUser,
  Profile,
  RESOURCE_CATEGORIES,
  ResourceCategory,
  ResourceRow
} from "@/lib/types";

type SortKey = "created_at" | "likes_count" | "author";
type SortDirection = "asc" | "desc";

type ResourceForm = {
  name: string;
  link: string;
  category: ResourceCategory;
  description: string;
};

const defaultForm: ResourceForm = {
  name: "",
  link: "",
  category: "article",
  description: ""
};

type RawResourceRow = Omit<ResourceRow, "profiles">;

function mapAppUser(user: User | null): AppUser | null {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    is_anonymous: user.is_anonymous
  };
}

export default function ResourcesApp() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [resourceForm, setResourceForm] = useState<ResourceForm>(defaultForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [loadingResources, setLoadingResources] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>("");

  const isAnonymous = Boolean(user?.is_anonymous);
  const canSocialAct = Boolean(user && !isAnonymous);

  const sortedResources = useMemo(() => {
    const copy = [...resources];

    copy.sort((a, b) => {
      let compare = 0;
      if (sortKey === "created_at") {
        compare = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else if (sortKey === "likes_count") {
        compare = a.likes_count - b.likes_count;
      } else {
        const authorA = (a.profiles?.name || "").toLowerCase();
        const authorB = (b.profiles?.name || "").toLowerCase();
        compare = authorA.localeCompare(authorB);
      }

      return sortDirection === "asc" ? compare : compare * -1;
    });

    return copy;
  }, [resources, sortDirection, sortKey]);

  async function ensureUserSession(options?: { announce?: boolean }) {
    const { announce = false } = options ?? {};
    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession();

    if (sessionError) {
      setMessage(sessionError.message);
      return null;
    }

    if (session?.user) {
      const activeUser = mapAppUser(session.user);
      setUser(activeUser);
      return activeUser;
    }

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      setMessage(
        `Could not create anonymous session. ${error.message}`
      );
      return null;
    }

    const guestUser = mapAppUser(data.user);
    setUser(guestUser);

    if (announce) {
      setMessage("Anonymous session ready. You can add resources now.");
    }

    return guestUser;
  }

  useEffect(() => {
    if (missingSupabaseEnv) {
      setMessage(
        "Missing Supabase env vars. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
      );
      setLoadingResources(false);
      return;
    }

    let mounted = true;

    async function bootstrapAuth() {
      if (!mounted) {
        return;
      }
      await ensureUserSession({ announce: true });
    }

    void bootstrapAuth();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(mapAppUser(session?.user ?? null));
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (missingSupabaseEnv) {
      return;
    }

    async function fetchResources() {
      setLoadingResources(true);

      const { data, error } = await supabase
        .from("resources")
        .select(
          "id,name,link,category,description,thumbnail_url,created_at,created_by,is_guest_post,likes_count"
        )
        .order("created_at", { ascending: false });

      if (error) {
        setMessage(error.message);
        setLoadingResources(false);
        return;
      }

      const typedResources = (data ?? []) as RawResourceRow[];
      const hydratedResources = await enrichResourcesWithProfiles(typedResources);
      setResources(hydratedResources);
      setLoadingResources(false);
    }

    void fetchResources();
  }, []);

  useEffect(() => {
    if (missingSupabaseEnv) {
      return;
    }

    async function fetchRelationshipState() {
      if (!user) {
        return;
      }

      const resourceIds = resources.map((resource) => resource.id);
      if (resourceIds.length === 0) {
        setLikedIds(new Set());
        setFollowingIds(new Set());
        return;
      }

      const { data: likesData } = await supabase
        .from("resource_likes")
        .select("resource_id")
        .eq("user_id", user.id)
        .in("resource_id", resourceIds);

      setLikedIds(new Set((likesData ?? []).map((item) => item.resource_id as string)));

      const uniqueAuthorIds = Array.from(
        new Set(resources.map((resource) => resource.created_by).filter((id) => id !== user.id))
      );
      if (uniqueAuthorIds.length === 0) {
        setFollowingIds(new Set());
        return;
      }

      const { data: followsData } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", user.id)
        .in("following_id", uniqueAuthorIds);

      setFollowingIds(
        new Set((followsData ?? []).map((item) => item.following_id as string))
      );
    }

    void fetchRelationshipState();
  }, [resources, user]);

  function setResourceField<Key extends keyof ResourceForm>(key: Key, value: ResourceForm[Key]) {
    setResourceForm((prev) => ({ ...prev, [key]: value }));
  }

  async function enrichResourcesWithProfiles(rawResources: RawResourceRow[]) {
    if (rawResources.length === 0) {
      return [] as ResourceRow[];
    }

    const authorIds = Array.from(
      new Set(rawResources.map((resource) => resource.created_by))
    );

    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("id,name,country,avatar_url")
      .in("id", authorIds);

    if (profilesError) {
      setMessage(profilesError.message);
      return rawResources.map((resource) => ({ ...resource, profiles: null }));
    }

    const profileById = new Map<string, Profile>();
    (profilesData ?? []).forEach((profile) => {
      profileById.set(profile.id as string, profile as Profile);
    });

    return rawResources.map((resource) => ({
      ...resource,
      profiles: profileById.get(resource.created_by) ?? null
    }));
  }

  async function reloadResources() {
    if (missingSupabaseEnv) {
      return;
    }

    const { data, error } = await supabase
      .from("resources")
      .select(
        "id,name,link,category,description,thumbnail_url,created_at,created_by,is_guest_post,likes_count"
      )
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(error.message);
      return;
    }

    const hydratedResources = await enrichResourcesWithProfiles(
      (data ?? []) as RawResourceRow[]
    );
    setResources(hydratedResources);
  }

  async function handleResourceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (missingSupabaseEnv) {
      return;
    }
    const activeUser = user ?? (await ensureUserSession());
    if (!activeUser) {
      setMessage("No active user session.");
      return;
    }

    setBusy(true);
    const payload = {
      name: resourceForm.name.trim(),
      link: resourceForm.link.trim(),
      category: resourceForm.category,
      description: resourceForm.description.trim() || null,
      created_by: activeUser.id,
      is_guest_post: Boolean(activeUser.is_anonymous)
    };

    const request = editingId
      ? supabase.from("resources").update(payload).eq("id", editingId)
      : supabase.from("resources").insert(payload);

    const { error } = await request;
    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(editingId ? "Resource updated." : "Resource added.");
    setResourceForm(defaultForm);
    setEditingId(null);
    await reloadResources();
  }

  async function handleDelete(id: string) {
    if (missingSupabaseEnv) {
      return;
    }

    setBusy(true);
    const { error } = await supabase.from("resources").delete().eq("id", id);
    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Resource deleted.");
    await reloadResources();
  }

  async function handleToggleLike(resourceId: string) {
    if (missingSupabaseEnv) {
      return;
    }

    if (!user || !canSocialAct) {
      setMessage("Likes are only available for registered users.");
      return;
    }

    const alreadyLiked = likedIds.has(resourceId);
    const request = alreadyLiked
      ? supabase.from("resource_likes").delete().eq("resource_id", resourceId).eq("user_id", user.id)
      : supabase.from("resource_likes").insert({ resource_id: resourceId, user_id: user.id });

    const { error } = await request;
    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(alreadyLiked ? "Like removed." : "Resource liked.");
    await reloadResources();
  }

  async function handleToggleFollow(authorId: string) {
    if (missingSupabaseEnv) {
      return;
    }

    if (!user || !canSocialAct) {
      setMessage("Follow is only available for registered users.");
      return;
    }

    if (authorId === user.id) {
      return;
    }

    const alreadyFollowing = followingIds.has(authorId);
    const request = alreadyFollowing
      ? supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", authorId)
      : supabase.from("follows").insert({ follower_id: user.id, following_id: authorId });

    const { error } = await request;
    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(alreadyFollowing ? "Unfollowed user." : "Now following user.");
    if (alreadyFollowing) {
      setFollowingIds((prev) => {
        const next = new Set(prev);
        next.delete(authorId);
        return next;
      });
    } else {
      setFollowingIds((prev) => new Set(prev).add(authorId));
    }
  }

  async function handleSignOut() {
    if (missingSupabaseEnv) {
      return;
    }

    await supabase.auth.signOut();
    await ensureUserSession();
    setMessage("Signed out. A fresh anonymous session was started.");
  }

  return (
    <main className="page">
      <section className="card">
        <p className="eyebrow">Longevity Resources</p>
        <h1>Longevity database MVP</h1>
        <p className="subtext">
          Guest posting is enabled. Registered users can like resources and follow
          contributors.
        </p>
        {message ? <p className="status">{message}</p> : null}
      </section>

      <section className="card">
        <h2>Account</h2>
        <p className="subtext">
          {user ? (
            <>
              Current session: <strong>{isAnonymous ? "Guest" : "Registered"}</strong>
              {user.email ? ` (${user.email})` : ""}
            </>
          ) : (
            "Loading session..."
          )}
        </p>

        <div className="inline-actions">
          <Link href="/auth">
            <button type="button">Manage account</button>
          </Link>
          <button type="button" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </section>

      <section className="card">
        <h2>{editingId ? "Edit resource" : "Add resource"}</h2>
        <form onSubmit={handleResourceSubmit} className="stack">
          <input
            value={resourceForm.name}
            onChange={(event) => setResourceField("name", event.target.value)}
            placeholder="Name"
            required
          />
          <input
            value={resourceForm.link}
            onChange={(event) => setResourceField("link", event.target.value)}
            placeholder="Link"
            type="url"
            required
          />
          <select
            value={resourceForm.category}
            onChange={(event) =>
              setResourceField("category", event.target.value as ResourceCategory)
            }
          >
            {RESOURCE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <textarea
            value={resourceForm.description}
            onChange={(event) => setResourceField("description", event.target.value)}
            placeholder="Description (optional)"
            rows={3}
          />
          <div className="inline-actions">
            <button type="submit" disabled={busy}>
              {editingId ? "Save changes" : "Add resource"}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setResourceForm(defaultForm);
                }}
              >
                Cancel edit
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="card">
        <div className="header-row">
          <h2>Resources</h2>
          <div className="sort-controls">
            <label>
              Sort by
              <select
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SortKey)}
              >
                <option value="created_at">Date</option>
                <option value="likes_count">Likes</option>
                <option value="author">Author</option>
              </select>
            </label>
            <label>
              Direction
              <select
                value={sortDirection}
                onChange={(event) =>
                  setSortDirection(event.target.value as SortDirection)
                }
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </label>
          </div>
        </div>

        {loadingResources ? <p>Loading resources...</p> : null}

        <ul className="resource-list">
          {sortedResources.map((resource) => {
            const isOwner = user?.id === resource.created_by;
            const isLiked = likedIds.has(resource.id);
            const authorName = resource.profiles?.name || "Anonymous contributor";

            return (
              <li key={resource.id} className="resource-item">
                <div className="resource-main">
                  <p className="resource-meta">
                    {resource.category} ·{" "}
                    <Link href={`/profile/${resource.created_by}`}>{authorName}</Link>{" "}
                    ·{" "}
                    {new Date(resource.created_at).toLocaleDateString()}
                  </p>
                  <h3>
                    <a href={resource.link} target="_blank" rel="noreferrer">
                      {resource.name}
                    </a>
                  </h3>
                  {resource.description ? (
                    <p className="subtext">{resource.description}</p>
                  ) : null}
                </div>

                <div className="inline-actions">
                  <button
                    type="button"
                    onClick={() => void handleToggleLike(resource.id)}
                    disabled={!canSocialAct}
                    title={
                      canSocialAct
                        ? "Toggle like"
                        : "Likes are for registered users only"
                    }
                  >
                    {isLiked ? "Unlike" : "Like"} ({resource.likes_count})
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleToggleFollow(resource.created_by)}
                    disabled={!canSocialAct || resource.created_by === user?.id}
                    title={
                      canSocialAct
                        ? "Toggle follow"
                        : "Follow is for registered users only"
                    }
                  >
                    {followingIds.has(resource.created_by) ? "Unfollow" : "Follow"}
                  </button>
                  {isOwner ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(resource.id);
                          setResourceForm({
                            name: resource.name,
                            link: resource.link,
                            category: resource.category,
                            description: resource.description ?? ""
                          });
                        }}
                      >
                        Edit
                      </button>
                      <button type="button" onClick={() => void handleDelete(resource.id)}>
                        Delete
                      </button>
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
