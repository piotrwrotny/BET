import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { CONFLICT_USER_BOOK_ACCESS, TABLE_USER_BOOK_ACCESS, TABLE_USER_ROLES } from "./schema";

type PublicTables = keyof Database["public"]["Tables"];

describe("schema constants", () => {
  it("TABLE_USER_ROLES matches the generated database type key", () => {
    const key: PublicTables = TABLE_USER_ROLES;
    expect(key).toBe("user_roles");
  });

  it("TABLE_USER_BOOK_ACCESS matches the generated database type key", () => {
    const key: PublicTables = TABLE_USER_BOOK_ACCESS;
    expect(key).toBe("user_book_access");
  });

  it("CONFLICT_USER_BOOK_ACCESS matches the table's composite unique key", () => {
    expect(CONFLICT_USER_BOOK_ACCESS).toBe("user_id,book_id");
  });
});
