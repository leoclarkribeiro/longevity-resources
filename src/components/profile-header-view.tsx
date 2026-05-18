"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import type { Profile } from "@/lib/types";
import ProfileSocialStats from "@/components/profile-social-stats";

export function profileDisplayName(profile: Profile | null): string {
  return profile?.name?.trim() || "Contributor";
}

type ProfileHeaderViewProps = {
  profile: Profile | null;
  userId: string;
  email?: string | null;
  actions?: ReactNode;
};

export default function ProfileHeaderView({
  profile,
  userId,
  email,
  actions
}: ProfileHeaderViewProps) {
  const name = profileDisplayName(profile);
  const initial = name.charAt(0).toUpperCase();

  return (
    <>
      <div className="auth-profile-view">
        <div className="avatar-uploader__preview auth-profile-view__avatar">
          {profile?.avatar_url ? (
            <Image
              src={profile.avatar_url}
              alt=""
              width={96}
              height={96}
              className="avatar-uploader__preview-img"
              unoptimized
            />
          ) : (
            <span className="avatar-uploader__fallback">{initial}</span>
          )}
        </div>
        <dl className="auth-profile-view__dl">
          <dt>Name</dt>
          <dd>{profile?.name?.trim() || "—"}</dd>
          {email ? (
            <>
              <dt>Email</dt>
              <dd>{email}</dd>
            </>
          ) : null}
          <dt>Country</dt>
          <dd>{profile?.country?.trim() || "—"}</dd>
        </dl>
      </div>
      <ProfileSocialStats userId={userId} />
      {actions ? <div className="inline-actions profile-header-view__actions">{actions}</div> : null}
    </>
  );
}
