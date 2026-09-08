-- Heal open settlements that still match rent + hire-time extras while return
-- charges are already posted (deposit held / not applied). Safe, idempotent.

with return_posted as (
  select
    hire_group_id,
    round(
      sum(coalesce(amount_gbp, 0))::numeric,
      2
    ) as posted_return_gbp
  from public.vehicle_hire_driver_charge_line_items
  where resolution = 'add_to_balance'
    and source_kind in (
      'checkin_inspection_damage',
      'checkin_inspection_fuel',
      'checkin_inspection_accessory'
    )
  group by hire_group_id
),
hire_extras as (
  select
    c.hire_group_id,
    round(
      greatest(
        0,
        sum(
          case
            when c.resolution in ('add_to_balance', 'paid_now') then coalesce(c.amount_gbp, 0)
            else 0
          end
        )
        - coalesce(
          (
            select sum(p.amount_gbp)
            from public.vehicle_hire_balance_payments p
            where p.hire_group_id = c.hire_group_id
              and p.direction = 'received_from_driver'
              and coalesce(p.payment_category, 'settlement') = 'driver_charge'
          ),
          0
        )
      )::numeric,
      2
    ) as hire_extras_outstanding_gbp
  from public.vehicle_hire_driver_charge_line_items c
  where coalesce(c.source_kind, '') not in (
    'checkin_inspection_damage',
    'checkin_inspection_fuel',
    'checkin_inspection_accessory'
  )
  group by c.hire_group_id
)
update public.vehicle_hire_groups g
set
  settlement_balance_gbp = round(
    (coalesce(g.settlement_balance_gbp, 0) + r.posted_return_gbp)::numeric,
    2
  ),
  settlement_balance_direction = 'driver_owes_company'
from return_posted r
left join hire_extras e on e.hire_group_id = r.hire_group_id
where g.id = r.hire_group_id
  and r.posted_return_gbp > 0.005
  and coalesce(g.deposit_disposition, 'hold_pending') not in ('apply_to_balance', 'forfeit')
  and coalesce(g.settlement_balance_direction, 'settled') is distinct from 'company_owes_driver'
  and abs(
    coalesce(g.settlement_balance_gbp, 0)
    - (
      coalesce((g.termination_settlement->>'signedRentBalanceGbp')::numeric, 0)
      + coalesce(e.hire_extras_outstanding_gbp, 0)
    )
  ) <= 0.005;
