-- Likes counter trigger updates resources owned by other users. Without
-- SECURITY DEFINER, RLS on resources (owner-only update) blocks the trigger
-- and likes_count never increments.
create or replace function public.sync_resource_likes_count()
returns trigger
language plpgsql
security definer
set search_path = public
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
