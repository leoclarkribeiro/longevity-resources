# Longevity Resources

Minimalist longevity resources database with optional social features.

## Current Status

Phase 2 core MVP flow is in progress:

- Routes: `/` (resources), `/auth` (account when signed in), `/auth/login`, `/auth/register`, `/profile/[id]` (contributor page)
- Supabase client helper in `src/lib/supabase`
- Migrations for schema, RLS, profile bootstrap trigger, and thumbnail job queue
- Supabase edge function scaffold in `supabase/functions/thumbnail-resolver`

## Product Rules Implemented in Schema

- Anonymous sessions can create resources.
- Users can only edit/delete their own resources.
- Registered users (non-anonymous) can like and follow.
- Resource posting is capped to 50 entries per user in a rolling 24-hour window.

## Local Setup

1. Install a package manager (`npm`, `pnpm`, or `yarn`) if not available.
2. Install dependencies:
   - `npm install`
3. Copy env template:
   - `cp .env.example .env.local`
4. Add your Supabase project values.
5. Start app:
   - `npm run dev`

## Supabase (Hosted-First)

This project can be deployed without local Docker by using your hosted Supabase project directly.

1. Authenticate CLI (one-time):
   - `npx supabase login`
2. Set project ref in shell:
   - `export SUPABASE_PROJECT_REF=your_project_ref`
3. Link this codebase to hosted project:
   - `npm run supabase:link`
4. Push migrations:
   - `npm run supabase:db:push`
5. Deploy thumbnail function:
   - `npm run supabase:functions:deploy`

If prompted, provide your Supabase DB password from project settings.

## Next Phase

- Apply migrations to your Supabase project.
- Wire `thumbnail-resolver` to a scheduled invocation.
- Expand thumbnail providers beyond YouTube/OpenLibrary.
- Add richer profile metadata and design polish.
