-- Sessions table for device pairing
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

-- Add session_id to fridge_items
alter table fridge_items
  add column session_id uuid references sessions(id);

-- Update unique index: scope to session
drop index if exists fridge_items_name_unique;
create unique index fridge_items_name_session_unique
  on fridge_items (lower(name), session_id);

-- Add session_id to scan_log
alter table scan_log
  add column session_id uuid references sessions(id);

-- RLS (open for MVP)
alter table sessions enable row level security;

create policy "Allow all on sessions" on sessions
  for all using (true) with check (true);

-- Enable realtime for sessions
alter publication supabase_realtime add table sessions;
