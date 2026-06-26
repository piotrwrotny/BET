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

const AUTH_USERS_PAGE_SIZE = 200;

async function listAllAuthUsersWithEmail(supabaseAdmin: ReturnType<typeof createAdminClient>) {
  const users: (User & { email: string })[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: AUTH_USERS_PAGE_SIZE,
    });

    if (error) {
      throw new Error(`Failed to list auth users page ${page}: ${error.message}`);
    }

    const pageUsers = data.users;
    if (pageUsers.length === 0) {
      break;
    }

    users.push(...pageUsers.filter((user): user is User & { email: string } => Boolean(user.email)));

    hasMore = pageUsers.length === AUTH_USERS_PAGE_SIZE;
    page += 1;
  }

  return users;
}

export async function getStudentsWithAccess(): Promise<UserWithAccess[]> {
  const supabaseAdmin = createAdminClient();
  const users = await listAllAuthUsersWithEmail(supabaseAdmin);
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

  const usersMissingRole = users.filter((user) => !roleByUserId.has(user.id));
  if (usersMissingRole.length > 0) {
    throw new Error(`Missing role rows for ${usersMissingRole.length} auth users`);
  }

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

  const studentUsers = users.reduce<UserWithAccess[]>((acc, user) => {
    const role = roleByUserId.get(user.id);
    if (!role) {
      throw new Error(`Missing role row for auth user ${user.id}`);
    }

    if (role !== "student") {
      return acc;
    }

    acc.push({
      id: user.id,
      email: user.email,
      role,
      created_at: user.created_at,
      books: accessByUserId.get(user.id) ?? [],
    });

    return acc;
  }, []);

  return studentUsers.sort((a, b) => a.email.localeCompare(b.email));
}
