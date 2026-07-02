import { z } from "zod";
import { uuidSchema } from "@/lib/utils";

export interface UserBookAccess {
  book_id: string;
  title: string;
  granted_at: string;
}

export interface UserWithAccess {
  id: string;
  email: string;
  role: "admin" | "student";
  created_at: string;
  books: UserBookAccess[];
}

export interface BookOption {
  id: string;
  title: string;
}

const UserBookAccessSchema = z.object({
  book_id: uuidSchema,
  title: z.string(),
  granted_at: z.string(),
});

const UserWithAccessSchema = z.object({
  id: uuidSchema,
  email: z.email(),
  role: z.enum(["admin", "student"]),
  created_at: z.string(),
  books: z.array(UserBookAccessSchema),
});

export const AdminUsersResponseSchema = z.object({
  users: z.array(UserWithAccessSchema),
  page: z.number().int().positive(),
  perPage: z.number().int().positive(),
  hasNextPage: z.boolean(),
});

export interface GetStudentsOptions {
  page?: number;
  perPage?: number;
}

export interface GetStudentsResult {
  users: UserWithAccess[];
  hasNextPage: boolean;
}
