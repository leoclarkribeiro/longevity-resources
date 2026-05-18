"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { missingSupabaseEnv, supabase } from "@/lib/supabase/client";
import {
  fetchFollowers,
  fetchFollowing,
  profileDisplayName,
  type ProfileListEntry
} from "@/lib/profile-social";
import ProfileSocialStats from "@/components/profile-social-stats";

type ProfileSocialListMode = "followers" | "following";

type ProfileSocialListPageProps = {
  userId: string;
  mode: ProfileSocialListMode;
};

export default function ProfileSocialListPage({ userId, mode }: ProfileSocialListPageProps) {
  const [profileName, setProfileName] = useState<string | null>(null);
  const [people, setPeople] = useState<ProfileListEntry[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const title = mode === "followers" ? "Followers" : "Following";
  const emptyLabel =
    mode === "followers" ? "No followers yet." : "Not following anyone yet.";

  useEffect(() => {
    if (missingSupabaseEnv) {
      setMessage(
        "Missing Supabase env vars. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
      );
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      setMessage("");

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", userId)
        .maybeSingle();

      if (profileError) {
        setMessage(profileError.message);
        setLoading(false);
        return;
      }

      setProfileName(profileData?.name?.trim() || null);

      try {
        const list = mode === "followers" ? await fetchFollowers(userId) : await fetchFollowing(userId);
        setPeople(list);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Failed to load list.");
      }

      setLoading(false);
    }

    void load();
  }, [userId, mode]);

  const subjectName = profileName || "Contributor";

  return (
    <main className="page">
      <section className="card">
        <p className="eyebrow">Profile</p>
        <h1 className="font-serif">
          {title} · {subjectName}
        </h1>
        <ProfileSocialStats userId={userId} />
        <div className="inline-actions" style={{ marginTop: "1rem" }}>
          <Link href={`/profile/${userId}`} className="btn-peach btn-peach--outline">
            View profile
          </Link>
          <Link href="/" className="btn-peach btn-peach--outline">
            Back to resources
          </Link>
        </div>
        {message ? <p className="status">{message}</p> : null}
      </section>

      <section className="card">
        {loading ? <p className="subtext">Loading…</p> : null}
        {!loading && people.length === 0 ? <p className="subtext">{emptyLabel}</p> : null}
        <ul className="profile-user-list">
          {people.map((person) => {
            const name = profileDisplayName(person);
            return (
              <li key={person.id} className="profile-user-list__item">
                <Link href={`/profile/${person.id}`} className="profile-user-list__link">
                  <span className="profile-user-list__avatar">
                    {person.avatar_url ? (
                      <Image
                        src={person.avatar_url}
                        alt=""
                        width={40}
                        height={40}
                        className="profile-user-list__avatar-img"
                        unoptimized
                      />
                    ) : (
                      <span className="profile-user-list__avatar-fallback" aria-hidden>
                        {name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </span>
                  <span className="profile-user-list__name">{name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
