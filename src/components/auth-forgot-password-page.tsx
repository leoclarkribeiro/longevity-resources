"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { missingSupabaseEnv, supabase } from "@/lib/supabase/client";
import { getAuthResetPasswordUrl } from "@/lib/site-url";

export default function AuthForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (missingSupabaseEnv) {
      return;
    }

    setBusy(true);
    setMessage("");

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: getAuthResetPasswordUrl()
    });

    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setSent(true);
    setMessage(
      "If an account exists for that email, we sent a link to reset your password. Check your inbox and spam folder."
    );
  }

  return (
    <main className="page auth-page">
      <section className="card auth-page__single">
        <p className="eyebrow">Account</p>
        <h1 className="font-serif">Reset password</h1>
        <p className="hint">
          Enter your account email and we&apos;ll send you a link to choose a new password.
        </p>
        {message ? <p className="status">{message}</p> : null}

        {!sent ? (
          <form onSubmit={handleSubmit} className="stack" style={{ marginTop: "1rem" }}>
            <input
              placeholder="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <button type="submit" className="btn-peach" disabled={busy}>
              Send reset link
            </button>
          </form>
        ) : null}

        <p className="auth-page__switch">
          Remember your password?{" "}
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
