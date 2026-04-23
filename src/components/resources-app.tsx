"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { missingSupabaseEnv, supabase } from "@/lib/supabase/client";
import { mapAppUser } from "@/lib/map-app-user";
import { resolveThumbnailFromUrl } from "@/lib/resolve-thumbnail";
import { useTheme } from "@/components/theme-provider";
import {
  AppUser,
  CATEGORY_LABELS,
  Profile,
  RESOURCE_CATEGORIES,
  ResourceCategory,
  ResourceRow
} from "@/lib/types";

type SortKey = "created_at" | "likes_count" | "author";
type SortDirection = "asc" | "desc";
type CategoryFilter = "all" | ResourceCategory;

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

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resourceThumbFrameClass(category: ResourceCategory): string {
  if (category === "book") {
    return "resource-card__thumb--book";
  }
  if (category === "video") {
    return "resource-card__thumb--video";
  }
  return "resource-card__thumb--landscape";
}

function categoryPlaceholderIcon(category: ResourceCategory): string {
  switch (category) {
    case "video":
      return "▶";
    case "podcast":
      return "🎙";
    case "book":
      return "📖";
    case "article":
      return "📄";
    case "services":
      return "✦";
    default:
      return "◇";
  }
}

function ResourceThumbnail({
  resolvedUrl,
  category
}: {
  resolvedUrl: string | null;
  category: ResourceCategory;
}) {
  const [failed, setFailed] = useState(false);
  if (!resolvedUrl || failed) {
    return (
      <span className="resource-card__thumb-placeholder" aria-hidden>
        {categoryPlaceholderIcon(category)}
      </span>
    );
  }
  return (
    <Image
      src={resolvedUrl}
      alt=""
      fill
      sizes="120px"
      className="resource-card__thumb-img"
      unoptimized
      onError={() => setFailed(true)}
    />
  );
}

function displayUserName(profile: Profile | null, user: AppUser | null): string {
  if (profile?.name?.trim()) {
    return profile.name.trim();
  }
  if (user?.email) {
    return user.email.split("@")[0] ?? "Guest";
  }
  return "Guest";
}

export default function ResourcesApp() {
  const { theme, toggleTheme } = useTheme();
  const [user, setUser] = useState<AppUser | null>(null);
  const [myProfile, setMyProfile] = useState<Profile | null>(null);
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [resourceForm, setResourceForm] = useState<ResourceForm>(defaultForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingResources, setLoadingResources] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [authGateOpen, setAuthGateOpen] = useState(false);

  const isAnonymous = Boolean(user?.is_anonymous);
  const canSocialAct = Boolean(user && !isAnonymous);
  const headerName = displayUserName(myProfile, user);

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

  const displayedResources = useMemo(() => {
    let list = sortedResources;
    if (categoryFilter !== "all") {
      list = list.filter((r) => r.category === categoryFilter);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const hay = `${r.name} ${r.description ?? ""} ${r.link}`.toLowerCase();
        return hay.includes(q);
      });
    }
    return list;
  }, [sortedResources, categoryFilter, searchQuery]);

  async function ensureGuestSession(): Promise<AppUser | null> {
    if (missingSupabaseEnv) {
      return null;
    }
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      setMessage(`Could not start a guest session. ${error.message}`);
      return null;
    }
    const guestUser = mapAppUser(data.user);
    setUser(guestUser);
    return guestUser;
  }

  const continueAsGuestFromGate = useCallback(async () => {
    const guest = await ensureGuestSession();
    if (guest) {
      setAuthGateOpen(false);
      setMessage("You are browsing as a guest. You can add resources now.");
    }
  }, []);

  useEffect(() => {
    if (missingSupabaseEnv) {
      setMessage(
        "Missing Supabase env vars. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
      );
      setLoadingResources(false);
      return;
    }

    let mounted = true;

    async function loadSession() {
      if (!mounted) {
        return;
      }
      const {
        data: { session },
        error: sessionError
      } = await supabase.auth.getSession();
      if (sessionError) {
        setMessage(sessionError.message);
        return;
      }
      setUser(mapAppUser(session?.user ?? null));
    }

    void loadSession();

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
    if (!user) {
      setLikedIds(new Set());
      setFollowingIds(new Set());
      setEditingId(null);
    }
  }, [user]);

  useEffect(() => {
    if (missingSupabaseEnv || !user) {
      setMyProfile(null);
      return;
    }

    void supabase
      .from("profiles")
      .select("id,name,country,avatar_url")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!error && data) {
          setMyProfile(data as Profile);
        } else {
          setMyProfile(null);
        }
      });
  }, [user]);

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

    const authorIds = Array.from(new Set(rawResources.map((resource) => resource.created_by)));

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

  function handleAddResourceNavClick() {
    scrollToSection("add-resource-form");
    if (!user) {
      setAuthGateOpen(true);
      setMessage("Sign in, create an account, or continue as a guest to add a resource.");
    }
  }

  async function handleResourceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (missingSupabaseEnv) {
      return;
    }
    if (!user) {
      setAuthGateOpen(true);
      setMessage("Sign in, create an account, or continue as a guest to add a resource.");
      return;
    }
    const activeUser = user;

    setBusy(true);
    const payload = {
      name: resourceForm.name.trim(),
      link: resourceForm.link.trim(),
      category: resourceForm.category,
      description: resourceForm.description.trim() || null,
      created_by: activeUser.id,
      is_guest_post: Boolean(activeUser.is_anonymous)
    };

    const derivedThumbnail = resolveThumbnailFromUrl(payload.link);
    const rowPayload = {
      ...payload,
      thumbnail_url: derivedThumbnail
    };

    const request = editingId
      ? supabase.from("resources").update(rowPayload).eq("id", editingId)
      : supabase.from("resources").insert(rowPayload);

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
    void supabase
      .from("profiles")
      .select("id,name,country,avatar_url")
      .eq("id", activeUser.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setMyProfile(data as Profile);
        }
      });
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
      prev.map((r) =>
        r.id !== resourceId
          ? r
          : {
              ...r,
              likes_count: alreadyLiked ? Math.max(0, r.likes_count - 1) : r.likes_count + 1
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
    setMyProfile(null);
    setMessage("Signed out.");
  }

  return (
    <div className="site-shell">
      <header className="site-header">
        <div className="site-header__inner">
          <Link href="/" className="site-logo font-serif">
            Longevity
            <br />
            Resources
          </Link>

          <nav className="site-nav" aria-label="Primary">
            <div className="site-header__right">
              <div className="site-header__top-cluster">
                <div className="site-header__nav-actions">
                  <button
                    type="button"
                    className="btn-peach"
                    onClick={() => scrollToSection("community-resources")}
                  >
                    Browse
                  </button>
                  <button type="button" className="btn-peach" onClick={handleAddResourceNavClick}>
                    Add Resource
                  </button>
                </div>
                {!user ? (
                  <div className="site-user site-user--auth-cta">
                    <Link href="/auth/register" className="btn-peach">
                      Create account
                    </Link>
                    <Link href="/auth/login" className="btn-peach btn-peach--outline">
                      Sign in
                    </Link>
                  </div>
                ) : (
                  <div className="site-user">
                    <Link
                      href="/auth"
                      className="site-user__profile-link"
                      aria-label={isAnonymous ? "Account and finish sign-up" : "View profile"}
                    >
                      <div className="site-user__avatar" aria-hidden>
                        {isAnonymous ? (
                          <span className="site-user__avatar-fallback site-user__avatar-fallback--guest">G</span>
                        ) : myProfile?.avatar_url ? (
                          <Image
                            src={myProfile.avatar_url}
                            alt=""
                            width={44}
                            height={44}
                            className="site-user__avatar-img"
                            unoptimized
                          />
                        ) : (
                          <span className="site-user__avatar-fallback">
                            {headerName.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="site-user__name">{headerName}</div>
                    </Link>
                    {isAnonymous ? (
                      <div className="site-user__guest-links">
                        <Link href="/auth/login" className="site-user__inline-link">
                          Sign in
                        </Link>
                        <span className="site-user__guest-sep" aria-hidden>
                          ·
                        </span>
                        <Link href="/auth/register" className="site-user__inline-link">
                          Register
                        </Link>
                      </div>
                    ) : (
                      <button type="button" className="site-user__signout" onClick={handleSignOut}>
                        Sign out
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="site-header__theme-wrap">
                <button
                  type="button"
                  className="theme-toggle"
                  onClick={toggleTheme}
                  aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
                >
                  <span className="theme-toggle__icon" aria-hidden>
                    {theme === "light" ? "☀" : "☾"}
                  </span>
                  <span className="theme-toggle__labels">
                    <span className={theme === "light" ? "is-active" : undefined}>Light</span>
                    <span className="theme-toggle__sep" aria-hidden>
                      /
                    </span>
                    <span className={theme === "dark" ? "is-active" : undefined}>Dark</span>
                  </span>
                </button>
              </div>
            </div>
          </nav>
        </div>
      </header>

      <section className="hero" aria-labelledby="hero-heading">
        <div className="hero__inner">
          <h1 id="hero-heading" className="hero__title font-serif">
            Curate Your Path to a Longer, Healthier Life
          </h1>
          <p className="hero__subtitle">
            A minimalist, community-driven database of the best longevity resources. Share,
            discover, and follow fellow enthusiasts.
          </p>
          {!user ? (
            <p className="hero__auth-cta">
              <Link href="/auth/register" className="hero__auth-cta-link">
                Create an account
              </Link>
              <span className="hero__auth-cta-sep"> · </span>
              <Link href="/auth/login" className="hero__auth-cta-link">
                Sign in
              </Link>
            </p>
          ) : null}
        </div>
      </section>

      <main className="site-main">
        {authGateOpen ? (
          <div
            className="auth-gate-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-gate-title"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setAuthGateOpen(false);
              }
            }}
          >
            <div className="auth-gate-modal__panel card" onClick={(e) => e.stopPropagation()}>
              <h2 id="auth-gate-title" className="font-serif auth-gate-modal__title">
                Add a resource
              </h2>
              <p className="subtext auth-gate-modal__text">
                Sign in, create an account, or continue as a guest to post. Guests can add resources; create an
                account any time to use likes and follows.
              </p>
              <div className="auth-gate-modal__actions">
                <button type="button" className="btn-peach" onClick={() => void continueAsGuestFromGate()}>
                  Continue as guest
                </button>
                <Link href="/auth/login" className="btn-peach btn-peach--outline" onClick={() => setAuthGateOpen(false)}>
                  Sign in
                </Link>
                <Link
                  href="/auth/register"
                  className="btn-peach btn-peach--outline"
                  onClick={() => setAuthGateOpen(false)}
                >
                  Create account
                </Link>
              </div>
              <button type="button" className="auth-gate-modal__cancel btn-ghost-sm" onClick={() => setAuthGateOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {message ? <p className="toast-status">{message}</p> : null}

        <section id="add-resource-form" className="add-form-panel">
          <h2>{editingId ? "Edit resource" : "Add a resource"}</h2>
          <form onSubmit={handleResourceSubmit} className="form-stack">
            <input
              value={resourceForm.name}
              onChange={(event) => setResourceField("name", event.target.value)}
              placeholder="Name"
              required
            />
            <input
              value={resourceForm.link}
              onChange={(event) => setResourceField("link", event.target.value)}
              placeholder="Link (URL)"
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
                  {CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
            <textarea
              value={resourceForm.description}
              onChange={(event) => setResourceField("description", event.target.value)}
              placeholder="Description (optional)"
              rows={3}
            />
            <div className="form-actions">
              <button type="submit" className="btn-peach" disabled={busy}>
                {editingId ? "Save changes" : "Submit resource"}
              </button>
              {editingId ? (
                <button
                  type="button"
                  className="btn-ghost-sm"
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

        <section id="community-resources" className="panel">
          <h2 className="panel__title font-serif">Community Resources</h2>

          <div className="toolbar">
            <div className="toolbar__search-wrap">
              <span className="toolbar__search-icon" aria-hidden>
                ⌕
              </span>
              <input
                className="toolbar__search"
                type="search"
                placeholder="Search by name or keyword..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                aria-label="Search resources"
              />
            </div>
            <div className="toolbar__field">
              <label htmlFor="filter-category">Category</label>
              <select
                id="filter-category"
                value={categoryFilter}
                onChange={(event) =>
                  setCategoryFilter(event.target.value as CategoryFilter)
                }
              >
                <option value="all">All categories</option>
                {RESOURCE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <div className="toolbar__field">
              <label htmlFor="filter-sort">Sort by</label>
              <select
                id="filter-sort"
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SortKey)}
              >
                <option value="created_at">Date</option>
                <option value="likes_count">Likes</option>
                <option value="author">Author</option>
              </select>
            </div>
            <div className="toolbar__field">
              <label htmlFor="filter-order">Order</label>
              <select
                id="filter-order"
                value={sortDirection}
                onChange={(event) =>
                  setSortDirection(event.target.value as SortDirection)
                }
              >
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </div>
          </div>

          {loadingResources ? (
            <p className="subtext">Loading resources…</p>
          ) : (
            <ul className="resource-cards">
              {displayedResources.map((resource) => {
                const isOwner = user?.id === resource.created_by;
                const isLiked = likedIds.has(resource.id);
                const authorName = resource.profiles?.name || "Anonymous contributor";
                const catLabel = CATEGORY_LABELS[resource.category];
                const displayThumb =
                  resource.thumbnail_url ?? resolveThumbnailFromUrl(resource.link);

                return (
                  <li key={resource.id} className="resource-card">
                    <div
                      className={`resource-card__thumb ${resourceThumbFrameClass(resource.category)}`}
                    >
                      <ResourceThumbnail resolvedUrl={displayThumb} category={resource.category} />
                    </div>
                    <div className="resource-card__body">
                      <h3 className="resource-card__title font-serif">
                        <a href={resource.link} target="_blank" rel="noreferrer">
                          {resource.name}
                        </a>
                      </h3>
                      <p className="resource-card__meta">
                        <span className="cat">{catLabel}</span>
                        {" · Added by "}
                        <Link href={`/profile/${resource.created_by}`} className="inline-link">
                          {authorName}
                        </Link>
                        {" on "}
                        {new Date(resource.created_at).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric"
                        })}
                      </p>
                      {resource.description ? (
                        <p className="resource-card__desc">{resource.description}</p>
                      ) : null}
                      <div className="resource-card__actions">
                        <button
                          type="button"
                          className={isLiked ? "btn-like btn-like--active" : "btn-like"}
                          onClick={() => void handleToggleLike(resource.id)}
                          disabled={!canSocialAct}
                          aria-pressed={isLiked}
                          title={
                            canSocialAct
                              ? isLiked
                                ? "Remove like"
                                : "Like"
                              : "Sign in with a full account to like"
                          }
                        >
                          <span className="btn-like__heart" aria-hidden>
                            ♥
                          </span>
                          {isLiked ? (
                            <span className="btn-like__count">{resource.likes_count}</span>
                          ) : null}
                        </button>
                        <button
                          type="button"
                          className="btn-follow"
                          onClick={() => void handleToggleFollow(resource.created_by)}
                          disabled={!canSocialAct || resource.created_by === user?.id}
                          title={
                            canSocialAct
                              ? "Follow contributor"
                              : "Sign in with a full account to follow"
                          }
                        >
                          {followingIds.has(resource.created_by)
                            ? `Unfollow ${authorName}`
                            : `Follow ${authorName}`}
                        </button>
                        <span className="pill-category">{catLabel}</span>
                        {isOwner ? (
                          <>
                            <button
                              type="button"
                              className="btn-ghost-sm"
                              onClick={() => {
                                setEditingId(resource.id);
                                setResourceForm({
                                  name: resource.name,
                                  link: resource.link,
                                  category: resource.category,
                                  description: resource.description ?? ""
                                });
                                scrollToSection("add-resource-form");
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn-ghost-sm"
                              onClick={() => void handleDelete(resource.id)}
                            >
                              Delete
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
