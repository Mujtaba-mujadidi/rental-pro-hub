-- Apply subcompany_scope and user_subcompany_permissions from invite metadata when a rental staff user is created.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta jsonb;
  v_full text;
  v_first text;
  v_last text;
  v_app_role text;
  v_company_txt text;
  v_company_id uuid;
  v_display text;
  v_company_role text;
  v_membership_role text;
  v_prop_role text;
  v_scope_meta text;
  v_ids_raw text;
  v_ids_json jsonb;
  v_final_scope text;
  v_mid uuid;
  v_explicit_count int;
begin
  v_meta := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_first := nullif(trim(v_meta->>'first_name'), '');
  v_last := nullif(trim(v_meta->>'last_name'), '');
  v_full := nullif(trim(v_meta->>'full_name'), '');
  v_app_role := lower(nullif(trim(v_meta->>'app_role'), ''));

  v_display := coalesce(
    v_full,
    case
      when v_first is not null and v_last is not null then v_first || ' ' || v_last
      when v_first is not null then v_first
      else split_part(new.email, '@', 1)
    end
  );

  v_company_txt := nullif(trim(v_meta->>'company_id'), '');
  v_company_id := null;
  if v_company_txt is not null then
    begin
      v_company_id := v_company_txt::uuid;
    exception when invalid_text_representation then
      v_company_id := null;
    end;
  end if;

  v_company_role := lower(nullif(trim(v_meta->>'company_role'), ''));
  v_prop_role := lower(nullif(trim(v_meta->>'rental_membership_role'), ''));

  v_scope_meta := lower(nullif(trim(v_meta->>'rental_subcompany_scope'), ''));
  v_ids_json := '[]'::jsonb;
  v_ids_raw := nullif(trim(v_meta->>'rental_subcompany_ids'), '');
  if v_ids_raw is not null then
    begin
      v_ids_json := v_ids_raw::jsonb;
      if jsonb_typeof(v_ids_json) <> 'array' then
        v_ids_json := '[]'::jsonb;
      end if;
    exception when others then
      v_ids_json := '[]'::jsonb;
    end;
  elsif v_meta ? 'rental_subcompany_ids' and jsonb_typeof(v_meta->'rental_subcompany_ids') = 'array' then
    v_ids_json := v_meta->'rental_subcompany_ids';
  end if;

  if v_app_role = 'rental_company' and v_company_id is not null then
    insert into public.profiles (id, display_name, role, company_id, company_role)
    values (
      new.id,
      v_display,
      'rental_company',
      v_company_id,
      case when v_company_role = 'staff' then 'staff' else 'admin' end
    )
    on conflict (id) do update set
      display_name = excluded.display_name,
      role = excluded.role,
      company_id = excluded.company_id,
      company_role = excluded.company_role,
      updated_at = now();

    v_membership_role := case
      when v_prop_role in ('owner', 'admin', 'operations', 'finance', 'viewer') then v_prop_role
      when v_company_role = 'staff' then 'operations'
      else 'owner'
    end;

    if v_membership_role in ('owner', 'admin') then
      v_final_scope := 'all';
    elsif v_scope_meta = 'explicit' and jsonb_array_length(v_ids_json) > 0 then
      select count(*)::int into v_explicit_count
      from (
        select trim(t.x) as sid_txt
        from jsonb_array_elements_text(v_ids_json) t(x)
      ) q
      inner join public.subcompanies s
        on s.parent_company_id = v_company_id
        and q.sid_txt ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and s.id = q.sid_txt::uuid;
      if v_explicit_count > 0 then
        v_final_scope := 'explicit';
      else
        v_final_scope := 'all';
      end if;
    else
      v_final_scope := 'all';
    end if;

    insert into public.user_company_memberships (user_id, parent_company_id, role, subcompany_scope, status)
    values (new.id, v_company_id, v_membership_role, v_final_scope, 'active')
    on conflict (user_id, parent_company_id) do update set
      status = 'active',
      role = excluded.role,
      subcompany_scope = excluded.subcompany_scope,
      updated_at = now()
    returning id into v_mid;

    delete from public.user_subcompany_permissions where membership_id = v_mid;

    if v_final_scope = 'explicit' then
      insert into public.user_subcompany_permissions (membership_id, subcompany_id)
      select v_mid, s.id
      from (
        select trim(t.x) as sid_txt
        from jsonb_array_elements_text(v_ids_json) t(x)
      ) q
      inner join public.subcompanies s
        on s.parent_company_id = v_company_id
        and q.sid_txt ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and s.id = q.sid_txt::uuid
      on conflict (membership_id, subcompany_id) do nothing;
    end if;
  else
    insert into public.profiles (id, display_name, role)
    values (new.id, v_display, 'driver')
    on conflict (id) do update set
      display_name = excluded.display_name,
      updated_at = now();
  end if;

  return new;
end;
$$;
