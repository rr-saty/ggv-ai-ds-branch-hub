-- GGV AI & DS Branch Hub: schema, role helpers, timestamps, and row-level security.
-- Apply only after reviewing the target project's existing data and policies.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'student' check (role in ('student','faculty','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 160),
  body text not null check (char_length(body) between 3 and 5000),
  category text not null default 'general' check (category in ('general','academic','event','urgent')),
  audience text not null default 'AI & DS students',
  status text not null default 'draft' check (status in ('draft','pending_review','published','archived')),
  publish_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  course_code text,
  faculty_name text,
  room text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  recurrence_rule text,
  source text not null default 'manual' check (source in ('manual','ics_import','external_sync')),
  external_id text,
  external_source text not null default 'google_calendar',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_time_valid check (ends_at > starts_at)
);

create table if not exists public.deadlines (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  due_at timestamptz not null,
  course_code text,
  url text,
  status text not null default 'upcoming' check (status in ('upcoming','completed','cancelled')),
  external_id text,
  external_source text not null default 'google_calendar',
  source text not null default 'manual' check (source in ('manual','ics_import','external_sync')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  url text not null,
  category text not null default 'study',
  status text not null default 'published' check (status in ('draft','published','archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  registration_url text,
  status text not null default 'published' check (status in ('draft','published','cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  item_type text not null,
  item_id uuid,
  channel text not null,
  recipient_ref text,
  status text not null default 'queued' check (status in ('queued','sent','failed','skipped')),
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists notices_status_publish_idx on public.notices(status, publish_at desc);
create unique index if not exists schedules_external_id_unique on public.schedules(external_source, external_id);
create unique index if not exists deadlines_external_id_unique on public.deadlines(external_source, external_id);
create index if not exists schedules_starts_at_idx on public.schedules(starts_at);
create index if not exists deadlines_due_at_idx on public.deadlines(due_at);
create index if not exists events_starts_at_idx on public.events(starts_at);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
-- current_user_role() returns only the role belonging to auth.uid(). For an anonymous user it returns NULL.
grant usage on schema private to anon, authenticated;

create or replace function private.current_user_role()
returns text language sql stable security definer set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid())
$$;
revoke all on function private.current_user_role() from public, anon, authenticated;
grant execute on function private.current_user_role() to anon, authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email, ''), 'student')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_branch_hub on auth.users;
create trigger on_auth_user_created_branch_hub after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at = now(); return new; end; $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','notices','schedules','deadlines','resources','events'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

alter table public.profiles enable row level security;
alter table public.notices enable row level security;
alter table public.schedules enable row level security;
alter table public.deadlines enable row level security;
alter table public.resources enable row level security;
alter table public.events enable row level security;
alter table public.notification_log enable row level security;

drop policy if exists "profiles read self or admin" on public.profiles;
create policy "profiles read self or admin" on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select private.current_user_role()) = 'admin');
drop policy if exists "profiles admin update" on public.profiles;
create policy "profiles admin update" on public.profiles for update to authenticated
using ((select private.current_user_role()) = 'admin')
with check ((select private.current_user_role()) = 'admin');

-- Published content is public-readable; faculty/admin can also see drafts.
do $$
declare t text;
begin
  foreach t in array array['notices','schedules','deadlines','resources','events'] loop
    execute format('drop policy if exists "public read published" on public.%I', t);
    if t = 'notices' then
      execute 'create policy "public read published" on public.notices for select to anon, authenticated using ((status = ''published'' and (publish_at is null or publish_at <= now())) or (select private.current_user_role()) in (''faculty'',''admin''))';
    elsif t = 'resources' then
      execute 'create policy "public read published" on public.resources for select to anon, authenticated using (status = ''published'' or (select private.current_user_role()) in (''faculty'',''admin''))';
    elsif t = 'events' then
      execute 'create policy "public read published" on public.events for select to anon, authenticated using (status = ''published'' or (select private.current_user_role()) in (''faculty'',''admin''))';
    elsif t = 'deadlines' then
      execute 'create policy "public read published" on public.deadlines for select to anon, authenticated using (status = ''upcoming'' or (select private.current_user_role()) in (''faculty'',''admin''))';
    else
      execute 'create policy "public read published" on public.schedules for select to anon, authenticated using ((select private.current_user_role()) in (''faculty'',''admin'') or starts_at >= now() - interval ''30 days'')';
    end if;
    execute format('drop policy if exists "staff insert" on public.%I', t);
    execute format('create policy "staff insert" on public.%I for insert to authenticated with check ((select private.current_user_role()) in (''faculty'',''admin''))', t);
    execute format('drop policy if exists "staff update" on public.%I', t);
    execute format('create policy "staff update" on public.%I for update to authenticated using ((select private.current_user_role()) in (''faculty'',''admin'')) with check ((select private.current_user_role()) in (''faculty'',''admin''))', t);
    execute format('drop policy if exists "admin delete" on public.%I', t);
    execute format('create policy "admin delete" on public.%I for delete to authenticated using ((select private.current_user_role()) = ''admin'')', t);
  end loop;
end $$;

drop policy if exists "admin read notification logs" on public.notification_log;
create policy "admin read notification logs" on public.notification_log for select to authenticated
using ((select private.current_user_role()) = 'admin');
drop policy if exists "staff create notification logs" on public.notification_log;
create policy "staff create notification logs" on public.notification_log for insert to authenticated
with check ((select private.current_user_role()) in ('faculty','admin'));

grant usage on schema public to anon, authenticated;
grant select on public.notices, public.schedules, public.deadlines, public.resources, public.events to anon, authenticated;
grant select, insert, update, delete on public.notices, public.schedules, public.deadlines, public.resources, public.events to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert on public.notification_log to authenticated;

-- Bootstrap the first administrator manually after the authorized first user signs up.
-- Replace the email with the exact approved account email, then run in the SQL Editor:
-- update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'YOUR_ADMIN_EMAIL');
