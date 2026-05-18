"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { missingSupabaseEnv, supabase } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (missingSupabaseEnv) {
      setError("Missing Supabase configuration.");
      return;
    }

    let mounted = true;

    async function finishAuth() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (!mounted) {
          return;
        }
        if (exchangeError) {
          setError(exchangeError.message);
          return;
        }
        router.replace("/auth");
        return;
      }

      const {
        data: { session },
        error: sessionError
      } = await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      if (sessionError) {
        setError(sessionError.message);
        return;
      }

      if (session && !session.user.is_anonymous) {
        router.replace("/auth");
        return;
      }

      const {
        data: { subscription }
      } = supabase.auth.onAuthStateChange((event, nextSession) => {
        if (!mounted) {
          return;
        }
        if (event === "SIGNED_IN" && nextSession && !nextSession.user.is_anonymous) {
          subscription.unsubscribe();
          router.replace("/auth");
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
            router.replace("/auth");
          } else {
            setError("Could not complete sign-in. Try signing in manually.");
          }
        });
      }, 2500);

      return () => {
        subscription.unsubscribe();
      };
    }

    void finishAuth();

    return () => {
      mounted = false;
    };
  }, [router]);

  return (
    <main className="page auth-page">
      <section className="card auth-page__single">
        {error ? (
          <>
            <p className="status">{error}</p>
            <div className="inline-actions" style={{ marginTop: "1.25rem" }}>
              <Link href="/auth/login" className="btn-peach">
                Sign in
              </Link>
            </div>
          </>
        ) : (
          <p className="subtext">Signing you in…</p>
        )}
      </section>
    </main>
  );
}
