"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { missingSupabaseEnv } from "@/lib/supabase/client";
import { fetchFollowCounts, type FollowCounts } from "@/lib/profile-social";

type ProfileSocialStatsProps = {
  userId: string;
};

export default function ProfileSocialStats({ userId }: ProfileSocialStatsProps) {
  const [counts, setCounts] = useState<FollowCounts | null>(null);

  useEffect(() => {
    if (missingSupabaseEnv || !userId) {
      return;
    }

    let mounted = true;

    async function load() {
      try {
        const next = await fetchFollowCounts(userId);
        if (mounted) {
          setCounts(next);
        }
      } catch {
        if (mounted) {
          setCounts({ followers: 0, following: 0 });
        }
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, [userId]);

  if (!counts) {
    return <p className="profile-social-stats subtext">Loading social stats…</p>;
  }

  return (
    <p className="profile-social-stats">
      <Link href={`/profile/${userId}/followers`} className="profile-social-stats__link">
        <strong>{counts.followers}</strong> {counts.followers === 1 ? "follower" : "followers"}
      </Link>
      <span className="profile-social-stats__sep" aria-hidden>
        ·
      </span>
      <Link href={`/profile/${userId}/following`} className="profile-social-stats__link">
        <strong>{counts.following}</strong> following
      </Link>
    </p>
  );
}
