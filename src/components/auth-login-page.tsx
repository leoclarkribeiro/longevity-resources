"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { missingSupabaseEnv, supabase } from "@/lib/supabase/client";
import { useAuthUser } from "@/lib/use-auth-user";

export default function AuthLoginPage() {
  const router = useRouter();
  const { user, ready } = useAuthUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!ready || !user) {
      return;
    }
    router.replace("/auth");
  }, [ready, user, router]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (missingSupabaseEnv) {
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });
    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    router.replace("/");
  }

  if (!ready) {
    return (
      <main className="page auth-page">
        <p className="subtext">Loading…</p>
      </main>
    );
  }

  if (user) {
    return (
      <main className="page auth-page">
        <p className="subtext">Redirecting…</p>
      </main>
    );
  }

  return (
    <main className="page auth-page">
      <section className="card auth-page__single">
        <p className="eyebrow">Account</p>
        <h1 className="font-serif">Sign in</h1>
        <p className="hint">Use the email and password for your existing account.</p>
        {message ? <p className="status">{message}</p> : null}

        <form onSubmit={handleLogin} className="stack" style={{ marginTop: "1rem" }}>
          <input
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <input
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <button type="submit" className="btn-peach" disabled={busy}>
            Sign in
          </button>
        </form>

        <p className="auth-page__switch">
          Don&apos;t have an account?{" "}
          <Link href="/auth/register" className="auth-page__switch-link">
            Create an account
          </Link>
        </p>

        <div className="inline-actions" style={{ marginTop: "1.25rem" }}>
          <Link href="/">
            <button type="button">Back to resources</button>
          </Link>
        </div>
      </section>
    </main>
  );
}
