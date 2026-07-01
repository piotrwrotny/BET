import { describe, expect, it, vi } from "vitest";
import { TABLE_USER_ROLES } from "@/lib/db/schema";
import { AdminUsersResponseSchema, type BookOption, getStudentsWithAccess } from "./user-admin";

const mockListUsers = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase", () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        listUsers: mockListUsers,
      },
    },
    from: mockFrom,
  }),
}));

vi.mock("@/lib/logger", () => ({
  logServerError: vi.fn(),
}));

function authUser(id: string, email: string) {
  return {
    id,
    email,
    created_at: new Date().toISOString(),
  };
}

function makeRoleRow(user_id: string, role: "admin" | "student") {
  return { user_id, role };
}

function makeAccessRow(user_id: string, book_id: string, title: string) {
  return {
    user_id,
    book_id,
    granted_at: new Date().toISOString(),
    books: { id: book_id, title },
  };
}

function setupQueries(responses: { roles?: unknown[]; access?: unknown[] }) {
  mockFrom.mockImplementation((table: string) => ({
    select: () => ({
      in: () =>
        Promise.resolve({
          data: table === TABLE_USER_ROLES ? (responses.roles ?? []) : (responses.access ?? []),
          error: null,
        }),
    }),
  }));
}

describe("getStudentsWithAccess", () => {
  it("returns empty result when no auth users exist", async () => {
    mockListUsers.mockResolvedValue({ data: { users: [] }, error: null });
    setupQueries({});

    const result = await getStudentsWithAccess({ page: 1, perPage: 20 });

    expect(result.users).toHaveLength(0);
    expect(result.hasNextPage).toBe(false);
  });

  it("filters users without email and computes hasNextPage from perPage+1", async () => {
    mockListUsers.mockResolvedValue({
      data: { users: [authUser("u1", "a@b.com"), { id: "u2", created_at: new Date().toISOString() }] },
      error: null,
    });
    setupQueries({ roles: [makeRoleRow("u1", "student")], access: [] });

    const result = await getStudentsWithAccess({ page: 1, perPage: 1 });

    expect(result.users).toHaveLength(1);
    expect(result.users[0]?.email).toBe("a@b.com");
    expect(result.hasNextPage).toBe(false); // only one email-bearing user, perPage+1 fetched 2 but one dropped
  });

  it("returns hasNextPage true when more email users than perPage", async () => {
    mockListUsers.mockResolvedValue({
      data: { users: [authUser("u1", "a@b.com"), authUser("u2", "b@b.com")] },
      error: null,
    });
    setupQueries({
      roles: [makeRoleRow("u1", "student"), makeRoleRow("u2", "student")],
      access: [],
    });

    const result = await getStudentsWithAccess({ page: 1, perPage: 1 });

    expect(result.users).toHaveLength(1);
    expect(result.hasNextPage).toBe(true);
  });

  it("excludes non-student users", async () => {
    mockListUsers.mockResolvedValue({
      data: { users: [authUser("u1", "a@b.com"), authUser("u2", "b@b.com")] },
      error: null,
    });
    setupQueries({
      roles: [makeRoleRow("u1", "student"), makeRoleRow("u2", "admin")],
      access: [],
    });

    const result = await getStudentsWithAccess({ page: 1, perPage: 20 });

    expect(result.users).toHaveLength(1);
    expect(result.users[0]?.id).toBe("u1");
  });

  it("excludes users with no role row", async () => {
    mockListUsers.mockResolvedValue({
      data: { users: [authUser("u1", "a@b.com")] },
      error: null,
    });
    setupQueries({ roles: [], access: [] });

    const result = await getStudentsWithAccess({ page: 1, perPage: 20 });

    expect(result.users).toHaveLength(0);
  });

  it("aggregates multiple book accesses per student", async () => {
    mockListUsers.mockResolvedValue({
      data: { users: [authUser("u1", "a@b.com")] },
      error: null,
    });
    setupQueries({
      roles: [makeRoleRow("u1", "student")],
      access: [makeAccessRow("u1", "b1", "Book 1"), makeAccessRow("u1", "b2", "Book 2")],
    });

    const result = await getStudentsWithAccess({ page: 1, perPage: 20 });

    expect(result.users[0]?.books).toHaveLength(2);
    expect(result.users[0]?.books.map((b) => b.title)).toEqual(["Book 1", "Book 2"]);
  });

  it("falls back to Unknown book when books relation is null", async () => {
    mockListUsers.mockResolvedValue({
      data: { users: [authUser("u1", "a@b.com")] },
      error: null,
    });
    setupQueries({
      roles: [makeRoleRow("u1", "student")],
      access: [
        {
          user_id: "u1",
          book_id: "b1",
          granted_at: new Date().toISOString(),
          books: null,
        },
      ],
    });

    const result = await getStudentsWithAccess({ page: 1, perPage: 20 });

    expect(result.users[0]?.books[0]?.title).toBe("Unknown book");
  });

  it("chunks role/access queries when there are more than 200 users", async () => {
    const users = Array.from({ length: 250 }, (_, i) => authUser(`u${i}`, `u${i}@b.com`));
    mockListUsers.mockResolvedValue({ data: { users }, error: null });
    setupQueries({
      roles: users.map((u) => makeRoleRow(u.id, "student")),
      access: [],
    });

    await getStudentsWithAccess({ page: 1, perPage: 20 });

    expect(mockFrom).toHaveBeenCalledWith(TABLE_USER_ROLES);
    const roleCalls = mockFrom.mock.calls.filter((call) => call[0] === TABLE_USER_ROLES);
    expect(roleCalls.length).toBeGreaterThan(1); // chunking triggered
  });

  it("throws when listUsers fails", async () => {
    mockListUsers.mockResolvedValue({ data: { users: [] }, error: new Error("boom") });

    await expect(getStudentsWithAccess({ page: 1, perPage: 20 })).rejects.toThrow("Failed to list auth users");
  });

  it("throws when role query fails", async () => {
    mockListUsers.mockResolvedValue({
      data: { users: [authUser("u1", "a@b.com")] },
      error: null,
    });
    mockFrom.mockImplementation(() => ({
      select: () => ({
        in: () => Promise.resolve({ data: [], error: new Error("db error") }),
      }),
    }));

    await expect(getStudentsWithAccess({ page: 1, perPage: 20 })).rejects.toThrow("Failed to fetch user roles");
  });
});

describe("AdminUsersResponseSchema", () => {
  it("accepts the current /api/admin/users response shape", () => {
    const book: BookOption = { id: "00000000-0000-0000-0000-000000000010", title: "Book One" };
    const response = {
      users: [
        {
          id: "00000000-0000-0000-0000-000000000002",
          email: "student@bet.local",
          role: "student",
          created_at: new Date().toISOString(),
          books: [{ book_id: book.id, title: book.title, granted_at: new Date().toISOString() }],
        },
      ],
      page: 1,
      perPage: 20,
      hasNextPage: false,
    };

    expect(() => AdminUsersResponseSchema.parse(response)).not.toThrow();
  });

  it("rejects a response missing pagination fields", () => {
    const response = { users: [] };

    expect(() => AdminUsersResponseSchema.parse(response)).toThrow();
  });

  it("rejects a user missing required fields", () => {
    const response = {
      users: [{ id: "00000000-0000-0000-0000-000000000002" }],
      page: 1,
      perPage: 20,
      hasNextPage: false,
    };

    expect(() => AdminUsersResponseSchema.parse(response)).toThrow();
  });
});
