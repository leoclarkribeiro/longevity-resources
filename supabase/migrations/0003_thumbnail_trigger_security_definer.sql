-- Ensure thumbnail job enqueue trigger can write regardless of caller role.
-- Without SECURITY DEFINER, anonymous/regular inserts into resources fail on
-- thumbnail_jobs RLS.
create or replace function public.enqueue_thumbnail_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.thumbnail_jobs (resource_id, link)
  values (new.id, new.link);
  return new;
end;
$$;
