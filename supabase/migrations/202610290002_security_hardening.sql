-- GGV AI & DS Branch Hub: additive security/performance hardening.
-- This does not alter or delete existing application data.
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- If the pre-existing project uses this SECURITY DEFINER event-trigger handler,
-- prevent direct execution grants while leaving PostgreSQL's event-trigger mechanism intact.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;

create index if not exists notices_created_by_idx on public.notices(created_by);
create index if not exists schedules_created_by_idx on public.schedules(created_by);
create index if not exists deadlines_created_by_idx on public.deadlines(created_by);
create index if not exists resources_created_by_idx on public.resources(created_by);
create index if not exists events_created_by_idx on public.events(created_by);
