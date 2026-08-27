export type UserRole =
  | "SUPER_ADMIN"
  | "SALES"
  | "HEAD_SA"
  | "SA";

export interface User {
  id: string;
  email: string;
  fullName: string;
  phoneNumber?: string | null;
  avatarUrl?: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  _count?: {
    createdProjects?: number;
    assignedMilestones?: number;
    approvalsGiven?: number;
  };
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface UsersResponse {
  users: User[];
  pagination: PaginationMeta;
}

export interface UserFilters {
  page?: number;
  limit?: number;
  search?: string;
  role?: UserRole | "ALL";
  isActive?: string;
}
