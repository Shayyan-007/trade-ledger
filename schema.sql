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
