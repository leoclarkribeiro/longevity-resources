// Supabase Edge Function: resolves thumbnail URLs for queued resources.
// Deploy with: supabase functions deploy thumbnail-resolver

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ThumbnailJob = {
  id: string;
  resource_id: string;
  link: string;
};

function resolveThumbnail(link: string): string | null {
  try {
    const url = new URL(link);

    if (url.hostname.includes("youtube.com") || url.hostname.includes("youtu.be")) {
      const videoId =
        url.hostname.includes("youtu.be")
          ? url.pathname.replace("/", "")
          : url.searchParams.get("v");
      if (videoId) {
        return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      }
    }

    if (url.hostname.includes("openlibrary.org")) {
      const match = url.pathname.match(/isbn\/([0-9Xx-]+)/);
      if (match?.[1]) {
        const isbn = match[1].replaceAll("-", "");
        return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
      }
    }
  } catch {
    return null;
  }

  return null;
}

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response("Missing Supabase env", { status: 500 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: jobs, error: jobsError } = await admin
    .from("thumbnail_jobs")
    .select("id,resource_id,link")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(25);

  if (jobsError) {
    return new Response(jobsError.message, { status: 500 });
  }

  const pendingJobs = (jobs ?? []) as ThumbnailJob[];
  for (const job of pendingJobs) {
    const thumbnailUrl = resolveThumbnail(job.link);
    const updates: Record<string, string | null> = {
      status: thumbnailUrl ? "done" : "failed",
      processed_at: new Date().toISOString(),
      error_message: thumbnailUrl ? null : "Unsupported or unresolved link"
    };

    if (thumbnailUrl) {
      await admin
        .from("resources")
        .update({ thumbnail_url: thumbnailUrl })
        .eq("id", job.resource_id);
    }

    await admin.from("thumbnail_jobs").update(updates).eq("id", job.id);
  }

  return Response.json({
    processed: pendingJobs.length
  });
});
