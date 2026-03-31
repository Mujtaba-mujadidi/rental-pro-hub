"use server";

import { requireSuperAdmin } from "@/lib/auth/profile";
import {
  fetchCompaniesPage,
  type CompanyListStatusFilter,
  type FetchCompaniesPageResult,
} from "@/lib/admin/companies-query";

export type AdminCompaniesListInput = {
  page: number;
  pageSize: number;
  search: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  status: CompanyListStatusFilter;
};

export async function getAdminCompaniesPageAction(input: AdminCompaniesListInput): Promise<FetchCompaniesPageResult> {
  await requireSuperAdmin();
  return fetchCompaniesPage({
    page: input.page,
    pageSize: input.pageSize,
    search: input.search,
    sortBy: input.sortBy,
    sortDir: input.sortDir,
    status: input.status,
  });
}
