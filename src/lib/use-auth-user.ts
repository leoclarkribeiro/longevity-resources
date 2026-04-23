"use client";

import { useEffect, useState } from "react";
import { missingSupabaseEnv, supabase } from "@/lib/supabase/client";
import type { AppUser } from "@/lib/types";
import { mapAppUser } from "@/lib/map-app-user";

/**
 * Subscribes to Supabase auth; `ready` is true after the first getSession completes.
 */
export function useAuthUser() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (missingSupabaseEnv) {
      setReady(true);
      return;
    }

    let mounted = true;

    async function init() {
      const {
        data: { session }
      } = await supabase.auth.getSession();
      if (!mounted) {
        return;
      }
      setUser(mapAppUser(session?.user ?? null));
      setReady(true);
    }

    void init();

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

  return { user, ready };
}
