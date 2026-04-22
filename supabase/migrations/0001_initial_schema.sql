-- Categories for longevity resources.
create type public.resource_category as enum (
  'video',
  'book',
  'podcast',
  'article',
  'services',
  'other'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  country text,
  avatar_url text,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  link text not null,
  category public.resource_category not null,
  description text,
  thumbnail_url text,
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid not null references auth.users (id) on delete cascade,
  is_guest_post boolean not null default false,
  likes_count integer not null default 0
);

create table public.resource_likes (
  resource_id uuid not null references public.resources (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (resource_id, user_id)
);

create table public.follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  following_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (follower_id, following_id),
  constraint follows_not_self check (follower_id <> following_id)
);

create index resources_created_at_idx on public.resources (created_at desc);
create index resources_created_by_idx on public.resources (created_by);
create index resources_likes_count_idx on public.resources (likes_count desc);
create index profiles_name_idx on public.profiles (name);
create index follows_following_idx on public.follows (following_id);

create function public.is_anonymous_user()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

create function public.enforce_daily_resource_limit()
returns trigger
language plpgsql
as $$
declare
  posts_in_window integer;
begin
  select count(*)
    into posts_in_window
    from public.resources
   where created_by = new.created_by
     and created_at >= timezone('utc', now()) - interval '24 hours';

  if posts_in_window >= 50 then
    raise exception 'Daily post limit reached (50 per 24 hours).';
  end if;

  return new;
end;
$$;

create trigger resources_daily_limit_trigger
before insert on public.resources
for each row
execute function public.enforce_daily_resource_limit();

create function public.sync_resource_likes_count()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.resources
       set likes_count = likes_count + 1
     where id = new.resource_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.resources
       set likes_count = greatest(likes_count - 1, 0)
     where id = old.resource_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger resource_likes_count_insert_trigger
after insert on public.resource_likes
for each row
execute function public.sync_resource_likes_count();

create trigger resource_likes_count_delete_trigger
after delete on public.resource_likes
for each row
execute function public.sync_resource_likes_count();

alter table public.profiles enable row level security;
alter table public.resources enable row level security;
alter table public.resource_likes enable row level security;
alter table public.follows enable row level security;

create policy "profiles are readable by everyone"
on public.profiles
for select
using (true);

create policy "users can upsert their own profile"
on public.profiles
for all
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "resources are readable by everyone"
on public.resources
for select
using (true);

create policy "signed-in users can insert resources"
on public.resources
for insert
with check (auth.uid() = created_by);

create policy "users can update their own resources"
on public.resources
for update
using (auth.uid() = created_by)
with check (auth.uid() = created_by);

create policy "users can delete their own resources"
on public.resources
for delete
using (auth.uid() = created_by);

create policy "likes are readable by everyone"
on public.resource_likes
for select
using (true);

create policy "registered users can like resources"
on public.resource_likes
for insert
with check (
  auth.uid() = user_id
  and public.is_anonymous_user() = false
);

create policy "registered users can remove their own likes"
on public.resource_likes
for delete
using (
  auth.uid() = user_id
  and public.is_anonymous_user() = false
);

create policy "follows are readable by everyone"
on public.follows
for select
using (true);

create policy "registered users can follow others"
on public.follows
for insert
with check (
  auth.uid() = follower_id
  and public.is_anonymous_user() = false
);

create policy "registered users can unfollow"
on public.follows
for delete
using (
  auth.uid() = follower_id
  and public.is_anonymous_user() = false
);
