-- TasteBuddy initial schema

-- Fridge items table
create table if not exists fridge_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'other',
  quantity integer not null default 1,
  confidence real not null default 0.0,
  is_present boolean not null default true,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  image_url text
);

-- Unique index on lowercased name for upsert deduplication
create unique index if not exists fridge_items_name_unique on fridge_items (lower(name));

-- Scan log table
create table if not exists scan_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  frame_count integer not null default 0,
  items_detected integer not null default 0,
  raw_response jsonb
);

-- RLS policies (open for MVP)
alter table fridge_items enable row level security;
alter table scan_log enable row level security;

create policy "Allow all on fridge_items" on fridge_items
  for all using (true) with check (true);

create policy "Allow all on scan_log" on scan_log
  for all using (true) with check (true);

-- Enable realtime
alter publication supabase_realtime add table fridge_items;
alter publication supabase_realtime add table scan_log;
