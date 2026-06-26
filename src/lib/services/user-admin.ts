import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase";

interface UserRoleRow {
  user_id: string;
  role: "admin" | "student";
}

interface AccessBookRow {
  id: string;
  title: string;
}

interface UserBookAccessRow {
  user_id: string;
  book_id: string;
  granted_at: string;
  books: AccessBookRow | AccessBookRow[] | null;
}

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

export async function getAllUsersWithAccess(): Promise<UserWithAccess[]> {
  const supabaseAdmin = createAdminClient();

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers();
  if (authError) {
    throw new Error(`Failed to list auth users: ${authError.message}`);
  }

  const users = authData.users.filter((user): user is User & { email: string } => Boolean(user.email));
  const userIds = users.map((user) => user.id);

  if (userIds.length === 0) {
    return [];
  }

  const [{ data: roleRows, error: rolesError }, { data: accessRows, error: accessError }] = await Promise.all([
    supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", userIds),
    supabaseAdmin
      .from("user_book_access")
      .select("user_id, book_id, granted_at, books(id, title)")
      .in("user_id", userIds),
  ]);

  if (rolesError) {
    throw new Error(`Failed to fetch user roles: ${rolesError.message}`);
  }

  if (accessError) {
    throw new Error(`Failed to fetch user access: ${accessError.message}`);
  }

  const roleByUserId = new Map<string, "admin" | "student">();
  (roleRows as UserRoleRow[]).forEach((row) => {
    roleByUserId.set(row.user_id, row.role);
  });

  const accessByUserId = new Map<string, UserBookAccess[]>();
  (accessRows as UserBookAccessRow[]).forEach((row) => {
    const book = row.books === null ? null : Array.isArray(row.books) ? (row.books[0] ?? null) : row.books;
    const entry: UserBookAccess = {
      book_id: row.book_id,
      title: book?.title ?? "Unknown book",
      granted_at: row.granted_at,
    };

    const current = accessByUserId.get(row.user_id) ?? [];
    current.push(entry);
    accessByUserId.set(row.user_id, current);
  });

  return users
    .map((user) => ({
      id: user.id,
      email: user.email,
      role: roleByUserId.get(user.id) ?? "student",
      created_at: user.created_at,
      books: accessByUserId.get(user.id) ?? [],
    }))
    .sort((a, b) => a.email.localeCompare(b.email));
}
