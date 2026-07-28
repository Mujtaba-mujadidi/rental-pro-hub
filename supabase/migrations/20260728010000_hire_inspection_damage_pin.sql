-- Store diagram view + pin position per damage so markers match where the user clicked.
alter table public.vehicle_hire_inspection_damages
  add column if not exists diagram_view text,
  add column if not exists pin_x integer,
  add column if not exists pin_y integer;

alter table public.vehicle_hire_inspection_damages
  drop constraint if exists vehicle_hire_inspection_damages_diagram_view_check;

alter table public.vehicle_hire_inspection_damages
  add constraint vehicle_hire_inspection_damages_diagram_view_check
  check (
    diagram_view is null
    or diagram_view in ('left_side', 'front', 'right_side', 'spare', 'rear', 'top')
  );
