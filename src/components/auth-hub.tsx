"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { User } from "@supabase/supabase-js";
import { missingSupabaseEnv, supabase } from "@/lib/supabase/client";
import type { AppUser, Profile } from "@/lib/types";

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

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

function displayName(profile: Profile | null, user: AppUser | null): string {
  if (profile?.name?.trim()) {
    return profile.name.trim();
  }
  if (user?.email) {
    return user.email.split("@")[0] ?? "You";
  }
  return "Guest";
}

function mimeToExt(mime: string): string {
  if (mime === "image/jpeg") {
    return "jpg";
  }
  if (mime === "image/png") {
    return "png";
  }
  if (mime === "image/webp") {
    return "webp";
  }
  return "gif";
}

export default function AuthHub() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");

  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [profileMode, setProfileMode] = useState<"view" | "edit">("view");
  const [authForm, setAuthForm] = useState({
    email: "",
    password: "",
    name: "",
    country: ""
  });
  const [editForm, setEditForm] = useState({ name: "", country: "" });

  const isAnonymous = Boolean(user?.is_anonymous);
  const headerName = displayName(profile, user);

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id,name,country,avatar_url")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      setMessage(error.message);
      return;
    }
    setProfile(data as Profile | null);
  }, []);

  function getEmailRedirectTo() {
    if (typeof window === "undefined") {
      return undefined;
    }
    return `${window.location.origin}/auth`;
  }

  useEffect(() => {
    if (missingSupabaseEnv) {
      setMessage(
        "Missing Supabase env vars. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
      );
      return;
    }

    let mounted = true;

    async function loadSession() {
      const {
        data: { session }
      } = await supabase.auth.getSession();
      if (!mounted) {
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
    if (missingSupabaseEnv || !user) {
      setProfile(null);
      return;
    }
    void loadProfile(user.id);
  }, [user, loadProfile]);

  useEffect(() => {
    if (profile && profileMode === "edit") {
      setEditForm({
        name: profile.name ?? "",
        country: profile.country ?? ""
      });
    }
  }, [profile, profileMode]);

  function setAuthField(key: "email" | "password" | "name" | "country", value: string) {
    setAuthForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleAvatarFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user || missingSupabaseEnv) {
      return;
    }

    if (!AVATAR_MIME.includes(file.type as (typeof AVATAR_MIME)[number])) {
      setMessage("Please choose a JPEG, PNG, WebP, or GIF image.");
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setMessage("Image must be 5MB or smaller.");
      return;
    }

    setBusy(true);
    const ext = mimeToExt(file.type);
    const path = `${user.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: "3600"
    });

    if (uploadError) {
      setBusy(false);
      setMessage(uploadError.message);
      return;
    }

    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
    const publicUrl = urlData.publicUrl;

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ avatar_url: publicUrl })
      .eq("id", user.id);

    setBusy(false);

    if (profileError) {
      setMessage(profileError.message);
      return;
    }

    setProfile((prev) =>
      prev
        ? { ...prev, avatar_url: publicUrl }
        : { id: user.id, name: null, country: null, avatar_url: publicUrl }
    );
    setMessage("Profile photo updated.");
  }

  async function handleRemoveAvatar() {
    if (!user || missingSupabaseEnv) {
      return;
    }

    setBusy(true);
    const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setProfile((prev) => (prev ? { ...prev, avatar_url: null } : null));
    setMessage("Profile photo removed.");
  }

  async function handleFinishGuestAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (missingSupabaseEnv || !user?.is_anonymous) {
      return;
    }

    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser(
      {
        email: authForm.email.trim(),
        password: authForm.password
      },
      {
        emailRedirectTo: getEmailRedirectTo()
      }
    );

    if (updateError) {
      setBusy(false);
      setMessage(updateError.message);
      return;
    }

    const { error: profileError } = await supabase.from("profiles").upsert({
      id: user.id,
      name: authForm.name.trim() || null,
      country: authForm.country.trim() || null
    });
    setBusy(false);

    if (profileError) {
      setMessage(profileError.message);
      return;
    }

    setMessage(
      "Check your email and open the link we sent you to confirm your address and finish setting up your account."
    );
    await loadProfile(user.id);
  }

  async function handleGuestSignInToExisting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (missingSupabaseEnv) {
      return;
    }

    setBusy(true);
    await supabase.auth.signOut();
    const { error } = await supabase.auth.signInWithPassword({
      email: authForm.email.trim(),
      password: authForm.password
    });
    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Signed in.");
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (missingSupabaseEnv) {
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: authForm.email.trim(),
      password: authForm.password
    });
    setBusy(false);

    setMessage(error ? error.message : "Signed in.");
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (missingSupabaseEnv) {
      return;
    }

    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: authForm.email.trim(),
      password: authForm.password,
      options: {
        emailRedirectTo: getEmailRedirectTo()
      }
    });

    const createdUserId = data.user?.id;
    if (!error && createdUserId) {
      await supabase.from("profiles").upsert({
        id: createdUserId,
        name: authForm.name.trim() || null,
        country: authForm.country.trim() || null
      });
    }
    setBusy(false);

    setMessage(
      error
        ? error.message
        : "Account created. If email confirmation is on, check your inbox to finish signing up."
    );
  }

  async function handleSaveProfileEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (missingSupabaseEnv || !user || isAnonymous) {
      return;
    }

    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        name: editForm.name.trim() || null,
        country: editForm.country.trim() || null
      })
      .eq("id", user.id);
    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadProfile(user.id);
    setProfileMode("view");
    setMessage("Profile saved.");
  }

  async function handleSignOut() {
    if (missingSupabaseEnv) {
      return;
    }
    await supabase.auth.signOut();
    setProfile(null);
    setProfileMode("view");
    setMessage("Signed out.");
  }

  const highlightLogin = tabParam === "login";
  const highlightRegister = tabParam !== "login";

  return (
    <main className="page auth-page">
      <section className="card">
        <p className="eyebrow">Account</p>
        <h1 className="font-serif">
          {!user
            ? "Sign in or register"
            : isAnonymous
              ? "Finish your account"
              : profileMode === "edit"
                ? "Edit profile"
                : "Your profile"}
        </h1>
        {message ? <p className="status">{message}</p> : null}
        <div className="inline-actions">
          <Link href="/">
            <button type="button">Back to resources</button>
          </Link>
        </div>
      </section>

      {!user ? (
        <div className="auth-page__grid">
          <section className={`card auth-page__card${highlightLogin ? " auth-page__card--focus" : ""}`} id="login">
            <h2 className="font-serif" style={{ marginTop: 0, fontSize: "1.2rem", color: "var(--heading-green)" }}>
              Sign in
            </h2>
            <p className="hint">Use the email and password for your existing account.</p>
            <form onSubmit={handleLogin} className="stack">
              <input
                placeholder="Email"
                type="email"
                value={authForm.email}
                onChange={(event) => setAuthField("email", event.target.value)}
                required
                autoComplete="email"
              />
              <input
                placeholder="Password"
                type="password"
                value={authForm.password}
                onChange={(event) => setAuthField("password", event.target.value)}
                required
                autoComplete="current-password"
              />
              <button type="submit" disabled={busy}>
                Sign in
              </button>
            </form>
          </section>

          <section
            className={`card auth-page__card${highlightRegister ? " auth-page__card--focus" : ""}`}
            id="register"
          >
            <h2 className="font-serif" style={{ marginTop: 0, fontSize: "1.2rem", color: "var(--heading-green)" }}>
              Create an account
            </h2>
            <p className="hint">Add your email and a password. You may need to confirm your email to finish.</p>
            <form onSubmit={handleRegister} className="stack">
              <input
                placeholder="Display name (optional)"
                value={authForm.name}
                onChange={(event) => setAuthField("name", event.target.value)}
                autoComplete="name"
              />
              <input
                placeholder="Country (optional)"
                value={authForm.country}
                onChange={(event) => setAuthField("country", event.target.value)}
                autoComplete="country-name"
              />
              <input
                placeholder="Email"
                type="email"
                value={authForm.email}
                onChange={(event) => setAuthField("email", event.target.value)}
                required
                autoComplete="email"
              />
              <input
                placeholder="Password"
                type="password"
                value={authForm.password}
                onChange={(event) => setAuthField("password", event.target.value)}
                required
                autoComplete="new-password"
              />
              <button type="submit" disabled={busy}>
                Create account
              </button>
            </form>
          </section>
        </div>
      ) : null}

      {user && !isAnonymous ? (
        <>
          <section className="card">
            {profileMode === "view" ? (
              <>
                <div className="auth-profile-view">
                  <div className="avatar-uploader__preview auth-profile-view__avatar">
                    {profile?.avatar_url ? (
                      <Image
                        src={profile.avatar_url}
                        alt=""
                        width={96}
                        height={96}
                        className="avatar-uploader__preview-img"
                        unoptimized
                      />
                    ) : (
                      <span className="avatar-uploader__fallback">{headerName.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <dl className="auth-profile-view__dl">
                    <dt>Name</dt>
                    <dd>{profile?.name?.trim() || "—"}</dd>
                    <dt>Email</dt>
                    <dd>{user.email || "—"}</dd>
                    <dt>Country</dt>
                    <dd>{profile?.country?.trim() || "—"}</dd>
                  </dl>
                </div>
                <div className="inline-actions" style={{ marginTop: "1rem" }}>
                  <button type="button" className="btn-peach" onClick={() => setProfileMode("edit")}>
                    Edit profile
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={handleSaveProfileEdit} className="stack">
                <div className="avatar-uploader" style={{ marginTop: "0.5rem" }}>
                  <div className="avatar-uploader__preview">
                    {profile?.avatar_url ? (
                      <Image
                        src={profile.avatar_url}
                        alt=""
                        width={96}
                        height={96}
                        className="avatar-uploader__preview-img"
                        unoptimized
                      />
                    ) : (
                      <span className="avatar-uploader__fallback">{headerName.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="avatar-uploader__controls">
                    <label className="avatar-uploader__label">
                      Choose photo
                      <input
                        type="file"
                        className="avatar-uploader__file"
                        accept={AVATAR_MIME.join(",")}
                        onChange={(event) => void handleAvatarFile(event)}
                        disabled={busy}
                      />
                    </label>
                    {profile?.avatar_url ? (
                      <button type="button" className="btn-ghost-sm" onClick={handleRemoveAvatar} disabled={busy}>
                        Remove photo
                      </button>
                    ) : null}
                  </div>
                </div>
                <p className="hint">JPG, PNG, WebP, or GIF. Max 5MB.</p>
                <input
                  placeholder="Display name"
                  value={editForm.name}
                  onChange={(event) => setEditForm((p) => ({ ...p, name: event.target.value }))}
                />
                <input
                  placeholder="Country"
                  value={editForm.country}
                  onChange={(event) => setEditForm((p) => ({ ...p, country: event.target.value }))}
                />
                <div className="inline-actions">
                  <button type="submit" disabled={busy}>
                    Save changes
                  </button>
                  <button
                    type="button"
                    className="btn-ghost-sm"
                    onClick={() => {
                      setProfileMode("view");
                      setMessage("");
                    }}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </section>

          <section className="card">
            <button type="button" className="btn-ghost-sm" onClick={() => void handleSignOut()}>
              Sign out
            </button>
          </section>
        </>
      ) : null}

      {user && isAnonymous ? (
        <div className="auth-page__grid auth-page__grid--stack">
          <section className="card">
            <h2 className="font-serif" style={{ marginTop: 0, fontSize: "1.2rem", color: "var(--heading-green)" }}>
              Add email and password
            </h2>
            <p className="hint">
              Enter the email and password you want for this account. We will send you a link to confirm your email
              and finish setup. Resources you added while browsing as a guest stay on this account.
            </p>
            <form onSubmit={handleFinishGuestAccount} className="stack">
              <input
                placeholder="Display name (optional)"
                value={authForm.name}
                onChange={(event) => setAuthField("name", event.target.value)}
              />
              <input
                placeholder="Country (optional)"
                value={authForm.country}
                onChange={(event) => setAuthField("country", event.target.value)}
              />
              <input
                placeholder="Email"
                type="email"
                value={authForm.email}
                onChange={(event) => setAuthField("email", event.target.value)}
                required
                autoComplete="email"
              />
              <input
                placeholder="Password"
                type="password"
                value={authForm.password}
                onChange={(event) => setAuthField("password", event.target.value)}
                required
                autoComplete="new-password"
              />
              <button type="submit" disabled={busy}>
                Send confirmation email
              </button>
            </form>
          </section>

          <section className="card">
            <h2 className="font-serif" style={{ marginTop: 0, fontSize: "1.2rem", color: "var(--heading-green)" }}>
              Already have an account?
            </h2>
            <p className="hint">
              Signing in here will end this guest session on this device. Posts you made as this guest stay with that
              guest account unless you finish creating the account above first.
            </p>
            <form onSubmit={handleGuestSignInToExisting} className="stack">
              <input
                placeholder="Email"
                type="email"
                value={authForm.email}
                onChange={(event) => setAuthField("email", event.target.value)}
                required
                autoComplete="email"
              />
              <input
                placeholder="Password"
                type="password"
                value={authForm.password}
                onChange={(event) => setAuthField("password", event.target.value)}
                required
                autoComplete="current-password"
              />
              <button type="submit" disabled={busy}>
                Sign in with existing account
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
