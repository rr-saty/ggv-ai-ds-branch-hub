-- Fix null-role fail-open edge case in the staff review RPC.
create or replace function public.review_branch_update_request(
  p_request_id uuid,
  p_decision text,
  p_review_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.branch_update_requests%rowtype;
  v_item_id uuid;
begin
  if coalesce((select private.current_user_role()), 'student') not in ('faculty','admin') then
    raise exception 'Only authorized faculty or administrators may review requests';
  end if;

  if p_decision not in ('approved','rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;

  select * into v_request
  from public.branch_update_requests
  where id = p_request_id
  for update;

  if not found then raise exception 'Request not found'; end if;
  if v_request.status <> 'pending_review' then
    raise exception 'This request has already been reviewed';
  end if;

  if p_decision = 'approved' then
    if v_request.request_type = 'notice' then
      insert into public.notices(title, body, category, audience, status, publish_at, created_by)
      values(v_request.title, v_request.details, 'general', v_request.audience, 'published', now(), (select auth.uid()))
      returning id into v_item_id;
    elsif v_request.request_type = 'deadline' then
      insert into public.deadlines(title, description, due_at, status, created_by)
      values(v_request.title, v_request.details, coalesce(v_request.requested_date, now() + interval '7 days'), 'upcoming', (select auth.uid()))
      returning id into v_item_id;
    elsif v_request.request_type = 'event' then
      insert into public.events(title, description, starts_at, status, created_by)
      values(v_request.title, v_request.details, coalesce(v_request.requested_date, now() + interval '7 days'), 'published', (select auth.uid()))
      returning id into v_item_id;
    elsif v_request.request_type = 'resource' then
      if v_request.details !~* '^https?://' then
        raise exception 'Resource requests must contain a valid http or https URL';
      end if;
      insert into public.resources(title, description, url, category, status, created_by)
      values(v_request.title, '', v_request.details, 'study', 'published', (select auth.uid()))
      returning id into v_item_id;
    end if;
  end if;

  update public.branch_update_requests
  set status = p_decision,
      reviewed_by = (select auth.uid()),
      reviewed_at = now(),
      review_note = nullif(left(coalesce(p_review_note, ''), 1000), ''),
      approved_item_id = v_item_id
  where id = p_request_id;

  return v_item_id;
end;
$$;
revoke all on function public.review_branch_update_request(uuid, text, text) from public, anon;
grant execute on function public.review_branch_update_request(uuid, text, text) to authenticated;
