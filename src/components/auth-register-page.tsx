"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { missingSupabaseEnv, supabase } from "@/lib/supabase/client";
import { useAuthUser } from "@/lib/use-auth-user";

function getEmailRedirectTo() {
  if (typeof window === "undefined") {
    return undefined;
  }
  return `${window.location.origin}/auth`;
}

export default function AuthRegisterPage() {
  const router = useRouter();
  const { user, ready } = useAuthUser();
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
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
        emailRedirectTo: getEmailRedirectTo()
      }
    });

    const createdUserId = data.user?.id;
    if (!error && createdUserId) {
      await supabase.from("profiles").upsert({
        id: createdUserId,
        name: name.trim() || null,
        country: country.trim() || null
      });
    }
    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(
      "Account created. If email confirmation is on, check your inbox to finish signing up. You can sign in once your email is confirmed."
    );
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
            ? "Add your email and a password. We’ll sign you out of this guest session when your new account is created. You may need to confirm your email to finish."
            : "Add your email and a password. You may need to confirm your email to finish."}
        </p>
        {message ? <p className="status">{message}</p> : null}

        <form onSubmit={handleRegister} className="stack" style={{ marginTop: "1rem" }}>
          <input
            placeholder="Display name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
          <input
            placeholder="Country (optional)"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            autoComplete="country-name"
          />
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
