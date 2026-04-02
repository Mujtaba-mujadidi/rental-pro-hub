"use server";

import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import {
  fetchRentalSubcompaniesPage,
  type FetchRentalSubcompaniesPageResult,
  type RentalSubcompanyStatusFilter,
} from "@/lib/rental/subcompanies-query";

export type RentalSubcompaniesListInput = {
  page: number;
  pageSize: number;
  search: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  status: RentalSubcompanyStatusFilter;
};

export async function getRentalSubcompaniesPageAction(
  input: RentalSubcompaniesListInput,
): Promise<FetchRentalSubcompaniesPageResult> {
  const { profile } = await requireRentalCompanyArea();
  const parentCompanyId = profile.company_id?.trim();
  if (!parentCompanyId) return { ok: false, error: "Missing rental company context." };

  const supabase = await createClient();
  return fetchRentalSubcompaniesPage(supabase, {
    parentCompanyId,
    page: input.page,
    pageSize: input.pageSize,
    search: input.search,
    sortBy: input.sortBy,
    sortDir: input.sortDir,
    status: input.status,
  });
}
