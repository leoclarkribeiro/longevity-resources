"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { User } from "@supabase/supabase-js";
import { missingSupabaseEnv, supabase } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

type AppUser = {
  id: string;
  email?: string;
  is_anonymous?: boolean;
};

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
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [authForm, setAuthForm] = useState({
    email: "",
    password: "",
    name: "",
    country: ""
  });

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
    async function bootstrapAuth() {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      if (!session) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) {
          setMessage(error.message);
          return;
        }
        setUser(mapAppUser(data.user));
        setMessage("Anonymous session ready.");
      } else {
        setUser(mapAppUser(session.user));
      }
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
    if (missingSupabaseEnv || !user) {
      setProfile(null);
      return;
    }
    void loadProfile(user.id);
  }, [user, loadProfile]);

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

  async function handleUpgradeGuest(event: FormEvent<HTMLFormElement>) {
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
      "Upgrade started. Check your email to confirm, then you will return to this site."
    );
    await loadProfile(user.id);
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

    setMessage(error ? error.message : "Logged in.");
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
        : "Account created. Check your email if confirmation is enabled."
    );
  }

  return (
    <main className="page">
      <section className="card">
        <p className="eyebrow">Account</p>
        <h1 className="font-serif">Sign in or upgrade</h1>
        <p className="subtext">
          Session: <strong>{isAnonymous ? "Guest" : "Registered"}</strong>
          {user?.email ? ` (${user.email})` : ""}
        </p>
        {message ? <p className="status">{message}</p> : null}
        <div className="inline-actions">
          <Link href="/">
            <button type="button">Back to resources</button>
          </Link>
        </div>
      </section>

      {user ? (
        <section className="card">
          <h2 className="font-serif" style={{ marginTop: 0, fontSize: "1.25rem", color: "var(--heading-green)" }}>
            Profile photo
          </h2>
          <p className="hint">
            JPG, PNG, WebP, or GIF. Max 5MB. Shown in the header after you save.
          </p>
          <div className="avatar-uploader" style={{ marginTop: "1rem" }}>
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
        </section>
      ) : null}

      <section className="card auth-grid">
        {isAnonymous ? (
          <>
            <form onSubmit={handleUpgradeGuest} className="stack">
              <h3>Upgrade this guest account</h3>
              <p className="hint">
                This keeps ownership of the resources you already posted as guest.
              </p>
              <input
                placeholder="Display name"
                value={authForm.name}
                onChange={(event) => setAuthField("name", event.target.value)}
              />
              <input
                placeholder="Country"
                value={authForm.country}
                onChange={(event) => setAuthField("country", event.target.value)}
              />
              <input
                placeholder="Email"
                type="email"
                value={authForm.email}
                onChange={(event) => setAuthField("email", event.target.value)}
                required
              />
              <input
                placeholder="Password"
                type="password"
                value={authForm.password}
                onChange={(event) => setAuthField("password", event.target.value)}
                required
              />
              <button type="submit" disabled={busy}>
                Upgrade account
              </button>
            </form>

            <form onSubmit={handleLogin} className="stack">
              <h3>Use an existing account instead</h3>
              <p className="hint">
                Logging into another account will not transfer guest-owned resources.
              </p>
              <input
                placeholder="Email"
                type="email"
                value={authForm.email}
                onChange={(event) => setAuthField("email", event.target.value)}
                required
              />
              <input
                placeholder="Password"
                type="password"
                value={authForm.password}
                onChange={(event) => setAuthField("password", event.target.value)}
                required
              />
              <button type="submit" disabled={busy}>
                Login
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="hint">
              You are already signed in with a registered account.
            </p>
            <form onSubmit={handleRegister} className="stack">
              <h3>Create another account</h3>
              <input
                placeholder="Display name"
                value={authForm.name}
                onChange={(event) => setAuthField("name", event.target.value)}
              />
              <input
                placeholder="Country"
                value={authForm.country}
                onChange={(event) => setAuthField("country", event.target.value)}
              />
              <input
                placeholder="Email"
                type="email"
                value={authForm.email}
                onChange={(event) => setAuthField("email", event.target.value)}
                required
              />
              <input
                placeholder="Password"
                type="password"
                value={authForm.password}
                onChange={(event) => setAuthField("password", event.target.value)}
                required
              />
              <button type="submit" disabled={busy}>
                Create account
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
