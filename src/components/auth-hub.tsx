"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { User } from "@supabase/supabase-js";
import { missingSupabaseEnv, supabase } from "@/lib/supabase/client";

type AppUser = {
  id: string;
  email?: string;
  is_anonymous?: boolean;
};

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

export default function AuthHub() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [authForm, setAuthForm] = useState({
    email: "",
    password: "",
    name: "",
    country: ""
  });

  const isAnonymous = Boolean(user?.is_anonymous);

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

  function setAuthField(key: "email" | "password" | "name" | "country", value: string) {
    setAuthForm((prev) => ({ ...prev, [key]: value }));
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
        <h1>Login or upgrade</h1>
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
