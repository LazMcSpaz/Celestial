-- ============================================================
-- Celestial — Supabase schema
-- Run this in the Supabase dashboard → SQL editor
-- ============================================================

-- ── Profiles (non-sensitive preferences, tied to auth.users) ─
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  chronotype text,
  work_style text,
  season text,
  cultivating text,
  cultivating_tags text[],   -- filled later by Claude Haiku
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;
create policy "profiles: own row only"
  on public.profiles for all
  using  (auth.uid() = id)
  with check (auth.uid() = id);

-- ── Tasks ─────────────────────────────────────────────────────
create table public.tasks (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  task_type text,
  energy_required text,
  emotional_weight text,
  repeating text default 'none',
  deadline date,
  completed boolean default false,
  completed_date date,
  deferred_date date,
  history jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.tasks enable row level security;
create policy "tasks: own rows only"
  on public.tasks for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Auto-stamp updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger tasks_updated_at
  before update on public.tasks
  for each row execute procedure public.set_updated_at();
