"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { missingSupabaseEnv, supabase } from "@/lib/supabase/client";
import { Profile, ResourceRow } from "@/lib/types";

type ProfilePageProps = {
  userId: string;
};

type ProfileResourceRow = Omit<ResourceRow, "profiles">;

export default function ProfilePage({ userId }: ProfilePageProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [resources, setResources] = useState<ProfileResourceRow[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (missingSupabaseEnv) {
      setMessage(
        "Missing Supabase env vars. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
      );
      setLoading(false);
      return;
    }

    async function loadData() {
      setLoading(true);
      const [{ data: profileData, error: profileError }, { data: resourceData, error: resourceError }] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("id,name,country,avatar_url")
            .eq("id", userId)
            .maybeSingle(),
          supabase
            .from("resources")
            .select(
              "id,name,link,category,description,thumbnail_url,created_at,created_by,is_guest_post,likes_count"
            )
            .eq("created_by", userId)
            .order("created_at", { ascending: false })
        ]);

      if (profileError || resourceError) {
        setMessage(profileError?.message || resourceError?.message || "Failed loading profile");
      }

      setProfile(profileData as Profile | null);
      setResources((resourceData ?? []) as ProfileResourceRow[]);
      setLoading(false);
    }

    void loadData();
  }, [userId]);

  return (
    <main className="page">
      <section className="card">
        <p className="eyebrow">Profile</p>
        <h1 className="font-serif">{profile?.name || "Contributor"}</h1>
        <p className="subtext">Country: {profile?.country || "Not specified"}</p>
        <div className="inline-actions">
          <Link href="/" className="btn-peach btn-peach--outline">
            Back to resources
          </Link>
          <Link href="/auth" className="btn-peach btn-peach--outline">
            Account page
          </Link>
        </div>
        {message ? <p className="status">{message}</p> : null}
      </section>

      <section className="card">
        <h2>Contributions</h2>
        {loading ? <p>Loading profile...</p> : null}
        <ul className="resource-list">
          {resources.map((resource) => (
            <li key={resource.id} className="resource-item">
              <p className="resource-meta">
                {resource.category} · {new Date(resource.created_at).toLocaleDateString()} ·{" "}
                {resource.likes_count} likes
              </p>
              <h3>
                <a href={resource.link} target="_blank" rel="noreferrer">
                  {resource.name}
                </a>
              </h3>
              {resource.description ? <p className="subtext">{resource.description}</p> : null}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
