alter table public.resources
add column if not exists date_published date;

create index if not exists resources_date_published_idx
on public.resources (date_published desc);
