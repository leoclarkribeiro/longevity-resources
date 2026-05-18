"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { missingSupabaseEnv, supabase } from "@/lib/supabase/client";
import { getAuthCallbackUrl } from "@/lib/site-url";
import { useAuthUser } from "@/lib/use-auth-user";

export default function AuthRegisterPage() {
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
    if (!user.is_anonymous) {
      router.replace("/auth");
    }
  }, [ready, user, router]);

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (missingSupabaseEnv) {
      return;
    }

    setBusy(true);
    setMessage("");
    const {
      data: { session }
    } = await supabase.auth.getSession();
    if (session?.user?.is_anonymous) {
      await supabase.auth.signOut();
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: getAuthCallbackUrl()
      }
    });
    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    if (data.session) {
      router.replace("/auth");
      return;
    }

    router.replace("/auth/login?registered=1");
  }

  if (!ready) {
    return (
      <main className="page auth-page">
        <p className="subtext">Loading…</p>
      </main>
    );
  }

  if (user && !user.is_anonymous) {
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
        <h1 className="font-serif">Create an account</h1>
        <p className="hint">
          {user?.is_anonymous
            ? "Add your email and a password. We’ll sign you out of this guest session when your new account is created."
            : "Add your email and a password."}
        </p>
        {message ? <p className="status">{message}</p> : null}

        <form onSubmit={handleRegister} className="stack" style={{ marginTop: "1rem" }}>
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
            autoComplete="new-password"
          />
          <button type="submit" className="btn-peach" disabled={busy}>
            Create account
          </button>
        </form>

        <p className="auth-page__switch">
          Already have an account?{" "}
          <Link href="/auth/login" className="auth-page__switch-link">
            Sign in
          </Link>
        </p>

        <div className="inline-actions" style={{ marginTop: "1.25rem" }}>
          <Link href="/" className="btn-peach btn-peach--outline">
            Back to resources
          </Link>
        </div>
      </section>
    </main>
  );
}
