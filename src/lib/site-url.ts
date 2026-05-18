/**
 * Canonical app origin for auth redirects (email links, sign-up).
 * Set NEXT_PUBLIC_SITE_URL in production to match Supabase Dashboard → Auth → URL Configuration → Site URL.
 */
export function getSiteOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "";
}

export function getAuthCallbackUrl(): string {
  const origin = getSiteOrigin();
  return origin ? `${origin}/auth/callback` : "/auth/callback";
}
