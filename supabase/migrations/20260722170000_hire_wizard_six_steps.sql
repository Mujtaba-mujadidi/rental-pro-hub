-- Hire wizard: step 5 = driver profile review, step 6 = e-sign.

alter table public.vehicle_hire_groups
  drop constraint if exists vehicle_hire_groups_wizard_step_check;

alter table public.vehicle_hire_groups
  add constraint vehicle_hire_groups_wizard_step_check
  check (wizard_step >= 1 and wizard_step <= 6);
