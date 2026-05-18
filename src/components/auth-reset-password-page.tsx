"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { missingSupabaseEnv, supabase } from "@/lib/supabase/client";

export default function AuthResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [canReset, setCanReset] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (missingSupabaseEnv) {
      setChecking(false);
      setMessage("Missing Supabase configuration.");
      return;
    }

    let mounted = true;

    async function verifyRecoverySession() {
      const hashParams = new URLSearchParams(
        typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : ""
      );
      const isRecoveryLink = hashParams.get("type") === "recovery";

      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      if (session && !session.user.is_anonymous) {
        setCanReset(true);
        setChecking(false);
        return;
      }

      const {
        data: { subscription }
      } = supabase.auth.onAuthStateChange((event, nextSession) => {
        if (!mounted) {
          return;
        }
        if (
          (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") &&
          nextSession &&
          !nextSession.user.is_anonymous
        ) {
          setCanReset(true);
          setChecking(false);
          subscription.unsubscribe();
        }
      });

      window.setTimeout(() => {
        if (!mounted) {
          return;
        }
        subscription.unsubscribe();
        void supabase.auth.getSession().then(({ data: { session: retrySession } }) => {
          if (!mounted) {
            return;
          }
          if (retrySession && !retrySession.user.is_anonymous) {
            setCanReset(true);
          } else if (!isRecoveryLink) {
            setMessage("This reset link is invalid or has expired. Request a new one.");
          } else {
            setMessage("Could not verify your reset link. Request a new one and try again.");
          }
          setChecking(false);
        });
      }, 2500);

      return () => {
        subscription.unsubscribe();
      };
    }

    void verifyRecoverySession();

    return () => {
      mounted = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canReset || missingSupabaseEnv) {
      return;
    }

    if (password.length < 6) {
      setMessage("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setBusy(true);
    setMessage("");

    const { error } = await supabase.auth.updateUser({ password });

    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    await supabase.auth.signOut();
    router.replace("/auth/login?reset=1");
  }

  return (
    <main className="page auth-page">
      <section className="card auth-page__single">
        <p className="eyebrow">Account</p>
        <h1 className="font-serif">Choose a new password</h1>
        {checking ? (
          <p className="subtext">Verifying your reset link…</p>
        ) : canReset ? (
          <>
            <p className="hint">Enter a new password for your account.</p>
            {message ? <p className="status">{message}</p> : null}
            <form onSubmit={handleSubmit} className="stack" style={{ marginTop: "1rem" }}>
              <input
                placeholder="New password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
              <input
                placeholder="Confirm new password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
              <button type="submit" className="btn-peach" disabled={busy}>
                Update password
              </button>
            </form>
          </>
        ) : (
          <>
            {message ? <p className="status">{message}</p> : null}
            <div className="inline-actions" style={{ marginTop: "1.25rem" }}>
              <Link href="/auth/forgot-password" className="btn-peach">
                Request new link
              </Link>
              <Link href="/auth/login" className="btn-peach btn-peach--outline">
                Sign in
              </Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
