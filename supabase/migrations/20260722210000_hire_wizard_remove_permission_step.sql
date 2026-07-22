-- Permission letter is always loaded from the latest published version at PDF time;
-- remove the dedicated wizard step and renumber later steps.

update public.vehicle_hire_groups
set wizard_step = wizard_step - 1
where status = 'draft'
  and wizard_step >= 5;

alter table public.vehicle_hire_groups
  drop constraint if exists vehicle_hire_groups_wizard_step_check;

alter table public.vehicle_hire_groups
  add constraint vehicle_hire_groups_wizard_step_check
  check (wizard_step >= 1 and wizard_step <= 6);
