"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { resolveThumbnailFromUrl } from "@/lib/resolve-thumbnail";
import { CATEGORY_LABELS, type ResourceCategory } from "@/lib/types";

export type ResourceCardData = {
  id: string;
  name: string;
  link: string;
  category: ResourceCategory;
  description: string | null;
  date_published: string | null;
  thumbnail_url: string | null;
  created_at: string;
  created_by: string;
  likes_count: number;
};

function resourceThumbFrameClass(category: ResourceCategory): string {
  if (category === "book") {
    return "resource-card__thumb--book";
  }
  if (category === "video") {
    return "resource-card__thumb--video";
  }
  return "resource-card__thumb--landscape";
}

function categoryPlaceholderIcon(category: ResourceCategory): string {
  switch (category) {
    case "video":
      return "▶";
    case "podcast":
      return "🎙";
    case "book":
      return "📖";
    case "article":
      return "📄";
    case "services":
      return "✦";
    default:
      return "◇";
  }
}

function ResourceThumbnail({
  resolvedUrl,
  category
}: {
  resolvedUrl: string | null;
  category: ResourceCategory;
}) {
  const [failed, setFailed] = useState(false);
  if (!resolvedUrl || failed) {
    return (
      <span className="resource-card__thumb-placeholder" aria-hidden>
        {categoryPlaceholderIcon(category)}
      </span>
    );
  }
  return (
    <Image
      src={resolvedUrl}
      alt=""
      fill
      sizes="120px"
      className="resource-card__thumb-img"
      unoptimized
      onError={() => setFailed(true)}
    />
  );
}

function formatDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

type ResourceCardProps = {
  resource: ResourceCardData;
  authorName?: string;
  isLiked?: boolean;
  isFollowing?: boolean;
  isOwner?: boolean;
  canSocialAct?: boolean;
  isAnonymousContributor?: boolean;
  showAuthor?: boolean;
  showFollow?: boolean;
  showOwnerActions?: boolean;
  onToggleLike?: () => void;
  onToggleFollow?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
};

export default function ResourceCard({
  resource,
  authorName = "Anonymous contributor",
  isLiked = false,
  isFollowing = false,
  isOwner = false,
  canSocialAct = false,
  isAnonymousContributor = false,
  showAuthor = true,
  showFollow = true,
  showOwnerActions = false,
  onToggleLike,
  onToggleFollow,
  onEdit,
  onDelete
}: ResourceCardProps) {
  const catLabel = CATEGORY_LABELS[resource.category];
  const publishedDateLabel = resource.date_published
    ? formatDateLabel(resource.date_published)
    : null;
  const addedDateLabel = formatDateLabel(resource.created_at);
  const displayThumb = resource.thumbnail_url ?? resolveThumbnailFromUrl(resource.link);

  return (
    <li className="resource-card">
      <div className={`resource-card__thumb ${resourceThumbFrameClass(resource.category)}`}>
        <ResourceThumbnail resolvedUrl={displayThumb} category={resource.category} />
      </div>
      <div className="resource-card__body">
        <h3 className="resource-card__title font-serif">
          <a href={resource.link} target="_blank" rel="noreferrer">
            {resource.name}
          </a>
        </h3>
        <p className="resource-card__meta">
          <span className="cat">{catLabel}</span>
          {publishedDateLabel ? ` · Published ${publishedDateLabel}` : ""}
          {showAuthor ? (
            <>
              {" · Added by "}
              <Link href={`/profile/${resource.created_by}`} className="inline-link">
                {authorName}
              </Link>
            </>
          ) : null}
          {" on "}
          {addedDateLabel}
        </p>
        {resource.description ? <p className="resource-card__desc">{resource.description}</p> : null}
        <div className="resource-card__actions">
          {onToggleLike ? (
            <button
              type="button"
              className={isLiked ? "btn-like btn-like--active" : "btn-like"}
              onClick={onToggleLike}
              disabled={!canSocialAct}
              aria-pressed={isLiked}
              title={
                canSocialAct
                  ? isLiked
                    ? "Remove like"
                    : "Like"
                  : "Sign in with a full account to like"
              }
            >
              <span className="btn-like__heart" aria-hidden>
                ♥
              </span>
              {resource.likes_count > 0 ? (
                <span
                  className={isLiked ? "btn-like__count" : "btn-like__count btn-like__count--others"}
                >
                  {resource.likes_count}
                </span>
              ) : null}
            </button>
          ) : null}
          {showFollow && onToggleFollow ? (
            <button
              type="button"
              className="btn-follow"
              onClick={onToggleFollow}
              disabled={!canSocialAct || isOwner || isAnonymousContributor}
              title={
                isAnonymousContributor
                  ? "Anonymous contributors cannot be followed"
                  : canSocialAct
                    ? "Follow contributor"
                    : "Sign in with a full account to follow"
              }
            >
              {isAnonymousContributor
                ? "Follow"
                : isFollowing
                  ? `Unfollow ${authorName}`
                  : `Follow ${authorName}`}
            </button>
          ) : null}
          <span className="pill-category">{catLabel}</span>
          {showOwnerActions && isOwner ? (
            <>
              {onEdit ? (
                <button type="button" className="btn-ghost-sm" onClick={onEdit}>
                  Edit
                </button>
              ) : null}
              {onDelete ? (
                <button type="button" className="btn-ghost-sm" onClick={onDelete}>
                  Delete
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </li>
  );
}

type ResourceCardListProps = {
  resources: ResourceCardData[];
  emptyMessage?: string;
  renderCard: (resource: ResourceCardData) => ReactNode;
};

export function ResourceCardList({ resources, emptyMessage, renderCard }: ResourceCardListProps) {
  if (resources.length === 0) {
    return emptyMessage ? <p className="subtext">{emptyMessage}</p> : null;
  }

  return <ul className="resource-cards">{resources.map((resource) => renderCard(resource))}</ul>;
}
