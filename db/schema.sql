create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists app_users_email_idx
  on public.app_users (email);

drop trigger if exists app_users_set_updated_at on public.app_users;
create trigger app_users_set_updated_at
before update on public.app_users
for each row
execute function public.set_updated_at();

create table if not exists public.monitor_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.app_users (id) on delete cascade,
  platform text not null check (platform in ('wechat', 'xiaohongshu', 'douyin', 'bilibili', 'wechat_live')),
  creator_id text not null default '',
  creator_name text not null default '',
  source_url text not null,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  poll_interval_minutes integer not null default 60,
  priority integer not null default 0,
  last_polled_at timestamptz,
  last_seen_item_id text not null default '',
  last_seen_published_at timestamptz,
  daily_budget_calls integer not null default 200,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists monitor_sources_platform_source_url_key
  on public.monitor_sources (platform, source_url);

create index if not exists monitor_sources_platform_status_idx
  on public.monitor_sources (platform, status, priority desc);

drop trigger if exists monitor_sources_set_updated_at on public.monitor_sources;
create trigger monitor_sources_set_updated_at
before update on public.monitor_sources
for each row
execute function public.set_updated_at();

create table if not exists public.monitor_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.app_users (id) on delete cascade,
  source_id uuid references public.monitor_sources (id) on delete set null,
  platform text not null check (platform in ('wechat', 'xiaohongshu', 'douyin', 'bilibili', 'wechat_live')),
  item_id text not null,
  title text not null default '',
  content_text text not null default '',
  summary text not null default '',
  source_url text not null default '',
  cover_url text not null default '',
  published_at timestamptz,
  metrics jsonb not null default '{}'::jsonb,
  fetch_stage text not null default 'list' check (fetch_stage in ('list', 'detail', 'comments')),
  cost_calls integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists monitor_items_platform_item_id_key
  on public.monitor_items (platform, item_id);

create index if not exists monitor_items_platform_published_at_idx
  on public.monitor_items (platform, published_at desc nulls last, created_at desc);

create index if not exists monitor_items_source_id_published_at_idx
  on public.monitor_items (source_id, published_at desc nulls last);

drop trigger if exists monitor_items_set_updated_at on public.monitor_items;
create trigger monitor_items_set_updated_at
before update on public.monitor_items
for each row
execute function public.set_updated_at();

create table if not exists public.monitor_api_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.app_users (id) on delete cascade,
  source_id uuid references public.monitor_sources (id) on delete set null,
  platform text not null check (platform in ('wechat', 'xiaohongshu', 'douyin', 'bilibili', 'wechat_live')),
  endpoint text not null default '',
  request_fingerprint text not null default '',
  response_code integer not null default 200,
  cost_unit numeric(10,2) not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists monitor_api_logs_platform_created_at_idx
  on public.monitor_api_logs (platform, created_at desc);
