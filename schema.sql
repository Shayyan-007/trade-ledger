-- Trade Ledger database. Run once in the Supabase SQL editor.
-- One table holds every record type; row-level security limits each signed-in user to their own rows.
create table if not exists public.entries (
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  kind       text        not null check (kind in ('trades','days','setups','watch','config')),
  id         text        not null,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, id)
);

alter table public.entries enable row level security;

drop policy if exists "read own entries"   on public.entries;
drop policy if exists "insert own entries" on public.entries;
drop policy if exists "update own entries" on public.entries;
drop policy if exists "delete own entries" on public.entries;

create policy "read own entries"   on public.entries for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert own entries" on public.entries for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "update own entries" on public.entries for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "delete own entries" on public.entries for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.entries from anon;
grant select, insert, update, delete on public.entries to authenticated;

-- Optional single-owner lock (not applied: friends can sign up). To close sign-ups, run:
--   create or replace function public.block_new_signups() returns trigger language plpgsql security definer set search_path = '' as $$ begin raise exception 'Sign-ups are closed for this journal.'; end; $$;
--   create trigger block_new_signups before insert on auth.users for each row execute function public.block_new_signups();

-- ===== v2 (applied 2026-11-08) =====
alter table public.entries drop constraint if exists entries_kind_check;
alter table public.entries add constraint entries_kind_check
  check (kind in ('trades','days','setups','watch','config','accounts','txns','instruments'));

-- Firm requests: insert-only for signed-in users; read in the Supabase dashboard.
create table if not exists public.firm_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  firm text not null check (char_length(firm) between 1 and 120),
  program text check (char_length(program) <= 160),
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now()
);
alter table public.firm_requests enable row level security;
create policy "submit firm requests" on public.firm_requests for insert to authenticated with check ((select auth.uid()) = user_id);
revoke all on public.firm_requests from anon;
grant insert on public.firm_requests to authenticated;

-- Feedback: users submit and read their own; status and reply are set by the owner.
create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  email text,
  kind text not null default 'change' check (kind in ('review','change','bug','idea')),
  area text check (char_length(area) <= 60),
  rating smallint check (rating between 1 and 5),
  message text not null check (char_length(message) between 1 and 4000),
  page text check (char_length(page) <= 60),
  app_version text check (char_length(app_version) <= 40),
  status text not null default 'new' check (status in ('new','planned','in progress','done','declined')),
  reply text check (char_length(reply) <= 2000),
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
create policy "submit own feedback" on public.feedback for insert to authenticated with check ((select auth.uid()) = user_id and status = 'new' and reply is null);
create policy "read own feedback" on public.feedback for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.feedback from anon;
grant select, insert on public.feedback to authenticated;
