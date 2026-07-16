-- Bug: subcompanies had two permissive SELECT policies for rental users.
-- `subcompanies_select_rental_company` (profiles.company_id match) allowed every
-- rental staff user to see ALL subcompanies for the parent company.
-- `subcompanies_select_rental_membership` correctly restricts by subcompany_scope
-- and user_subcompany_permissions. With default PERMISSIVE RLS, either policy
-- granting access is enough — so explicit scope was ignored.
-- Drop the profile-wide policies; membership-based policies remain (owner/admin/ops
-- for mutations; scoped select for all active members).

drop policy if exists subcompanies_select_rental_company on public.subcompanies;
drop policy if exists subcompanies_insert_rental_company on public.subcompanies;
drop policy if exists subcompanies_update_rental_company on public.subcompanies;
drop policy if exists subcompanies_delete_rental_company on public.subcompanies;
