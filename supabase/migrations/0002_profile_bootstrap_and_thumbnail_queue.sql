-- Automatically create a profile row whenever a new auth user is created.
create function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user_profile();

-- Lightweight queue table used by app or trigger to request thumbnail resolution.
create table if not exists public.thumbnail_jobs (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources (id) on delete cascade,
  link text not null,
  status text not null default 'pending',
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz
);

create index if not exists thumbnail_jobs_status_idx
  on public.thumbnail_jobs (status, created_at);

alter table public.thumbnail_jobs enable row level security;

create policy "thumbnail jobs are not directly readable by clients"
on public.thumbnail_jobs
for select
using (false);

create policy "service role manages thumbnail jobs"
on public.thumbnail_jobs
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create function public.enqueue_thumbnail_job()
returns trigger
language plpgsql
as $$
begin
  insert into public.thumbnail_jobs (resource_id, link)
  values (new.id, new.link);
  return new;
end;
$$;

drop trigger if exists resources_enqueue_thumbnail on public.resources;

create trigger resources_enqueue_thumbnail
after insert on public.resources
for each row
execute function public.enqueue_thumbnail_job();
