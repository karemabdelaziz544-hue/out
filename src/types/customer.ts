/**
 * Customer Types & Interfaces
 */

import type { Profile } from "./auth";

export type Customer = Profile;

export interface CustomerStats {
  total: number;
  active: number;
  inactive: number;
}

export interface CustomersFilterParams {
  query?: string;
  status?: "all" | "active" | "inactive";
  page?: number;
  pageSize?: number;
}

export interface CustomersListResult {
  customers: Customer[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
