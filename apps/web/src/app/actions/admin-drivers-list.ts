"use server";

import { requireSuperAdmin } from "@/lib/auth/profile";
import { fetchDriversPage, type DriverListStatusFilter, type FetchDriversPageResult } from "@/lib/admin/drivers-query";

export type AdminDriversListInput = {
  page: number;
  pageSize: number;
  search: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  status: DriverListStatusFilter;
};

export async function getAdminDriversPageAction(input: AdminDriversListInput): Promise<FetchDriversPageResult> {
  await requireSuperAdmin();
  return fetchDriversPage({
    page: input.page,
    pageSize: input.pageSize,
    search: input.search,
    sortBy: input.sortBy,
    sortDir: input.sortDir,
    status: input.status,
  });
}
