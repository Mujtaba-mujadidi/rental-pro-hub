-- Single published permission letter per rental company + wizard step 7 (permission after T&C).

create table if not exists public.company_hire_permission_letters (
  parent_company_id uuid primary key references public.companies (id) on delete cascade,
  title text not null default 'Driver permission letter',
  body text not null default '',
  published_at timestamptz,
  published_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create or replace function public.company_hire_permission_letters_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists company_hire_permission_letters_touch on public.company_hire_permission_letters;
create trigger company_hire_permission_letters_touch
  before update on public.company_hire_permission_letters
  for each row execute procedure public.company_hire_permission_letters_set_updated_at();

alter table public.company_hire_permission_letters enable row level security;

drop policy if exists company_hire_permission_letters_select on public.company_hire_permission_letters;
create policy company_hire_permission_letters_select on public.company_hire_permission_letters
  for select to authenticated
  using (public.user_is_active_company_member(parent_company_id));

drop policy if exists company_hire_permission_letters_write on public.company_hire_permission_letters;
create policy company_hire_permission_letters_write on public.company_hire_permission_letters
  for all to authenticated
  using (public.user_can_manage_company_settings(parent_company_id))
  with check (public.user_can_manage_company_settings(parent_company_id));

alter table public.vehicle_hire_groups
  add column if not exists permission_letter_snapshot jsonb not null default '{}'::jsonb;

-- Bump in-progress draft wizard steps after new permission step (old 4→5, 5→6, 6→7).
update public.vehicle_hire_groups
set wizard_step = wizard_step + 1
where status = 'draft'
  and wizard_step >= 4;

alter table public.vehicle_hire_groups
  drop constraint if exists vehicle_hire_groups_wizard_step_check;

alter table public.vehicle_hire_groups
  add constraint vehicle_hire_groups_wizard_step_check
  check (wizard_step >= 1 and wizard_step <= 7);
