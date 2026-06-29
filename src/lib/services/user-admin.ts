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
function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

const ID_CHUNK_SIZE = 200;

async function listAllAuthUsersWithEmail(supabaseAdmin: ReturnType<typeof createAdminClient>) {
  const users: (User & { email: string })[] = [];
  let page = 1;
  let hasMore = true;
  const MAX_AUTH_PAGES = 1000;

  while (hasMore) {
    if (page > MAX_AUTH_PAGES) {
      console.error("Exceeded maximum auth user pages:", MAX_AUTH_PAGES);
      throw new Error("Too many auth users to load");
    }

    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: AUTH_USERS_PAGE_SIZE,
    });

    if (error) {
      console.error(`Failed to list auth users page ${page}:`, error);
      throw new Error("Failed to list auth users");
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

interface GetStudentsOptions {
  page?: number;
  perPage?: number;
}

interface GetStudentsResult {
  users: UserWithAccess[];
  hasNextPage: boolean;
}

export async function getStudentsWithAccess(options: GetStudentsOptions = {}): Promise<GetStudentsResult> {
  const { page = 1, perPage = 20 } = options;
  const supabaseAdmin = createAdminClient();

  // Fetch one extra page to determine if there is a next page.
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({
    page,
    perPage: perPage + 1,
  });

  if (error) {
    console.error("Failed to list auth users:", error);
    throw new Error("Failed to list auth users");
  }

  const pageUsers = (data.users ?? []).filter((user): user is User & { email: string } => Boolean(user.email));
  const hasNextPage = pageUsers.length > perPage;
  const users = pageUsers.slice(0, perPage);
  const userIds = users.map((user) => user.id);

  if (userIds.length === 0) {
    return { users: [], hasNextPage };
  }

  const userIdChunks = chunk(userIds, ID_CHUNK_SIZE);

  const [roleResults, accessResults] = await Promise.all([
    Promise.all(userIdChunks.map((ids) => supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids))),
    Promise.all(
      userIdChunks.map((ids) =>
        supabaseAdmin
          .from("user_book_access")
          .select("user_id, book_id, granted_at, books(id, title)")
          .in("user_id", ids),
      ),
    ),
  ]);

  const rolesError = roleResults.find((result) => result.error)?.error ?? null;
  const accessError = accessResults.find((result) => result.error)?.error ?? null;
  const roleRows: UserRoleRow[] = roleResults.flatMap((result) => result.data ?? []);
  const accessRows: UserBookAccessRow[] = accessResults.flatMap(
    (result) => (result.data as UserBookAccessRow[] | null) ?? [],
  );

  if (rolesError) {
    console.error("Failed to fetch user roles:", rolesError);
    throw new Error("Failed to fetch user roles");
  }

  if (accessError) {
    console.error("Failed to fetch user access:", accessError);
    throw new Error("Failed to fetch user access");
  }

  const roleByUserId = new Map<string, "admin" | "student">();
  roleRows.forEach((row) => {
    roleByUserId.set(row.user_id, row.role);
  });

  const accessByUserId = new Map<string, UserBookAccess[]>();
  accessRows.forEach((row) => {
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

  return { users: studentUsers.sort((a, b) => a.email.localeCompare(b.email)), hasNextPage };
}
