import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import {
  CONFLICT_EXERCISE_SUBMISSIONS,
  CONFLICT_LESSON_READING_CONFIRMATIONS,
  CONFLICT_USER_BOOK_ACCESS,
  TABLE_BOOKS,
  TABLE_CHAPTERS,
  TABLE_EXERCISE_KEYS,
  TABLE_EXERCISE_SUBMISSIONS,
  TABLE_LESSON_PROGRESS,
  TABLE_LESSON_READING_CONFIRMATIONS,
  TABLE_LESSONS,
  TABLE_USER_BOOK_ACCESS,
  TABLE_USER_ROLES,
} from "./schema";

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

  it("TABLE_BOOKS matches the generated database type key", () => {
    const key: PublicTables = TABLE_BOOKS;
    expect(key).toBe("books");
  });

  it("TABLE_CHAPTERS matches the generated database type key", () => {
    const key: PublicTables = TABLE_CHAPTERS;
    expect(key).toBe("chapters");
  });

  it("TABLE_LESSONS matches the generated database type key", () => {
    const key: PublicTables = TABLE_LESSONS;
    expect(key).toBe("lessons");
  });

  it("TABLE_EXERCISE_KEYS matches the generated database type key", () => {
    const key: PublicTables = TABLE_EXERCISE_KEYS;
    expect(key).toBe("exercise_keys");
  });

  it("TABLE_EXERCISE_SUBMISSIONS matches the generated database type key", () => {
    const key: PublicTables = TABLE_EXERCISE_SUBMISSIONS;
    expect(key).toBe("exercise_submissions");
  });

  it("TABLE_LESSON_PROGRESS matches the generated database type key", () => {
    const key: PublicTables = TABLE_LESSON_PROGRESS;
    expect(key).toBe("lesson_progress");
  });

  it("TABLE_LESSON_READING_CONFIRMATIONS matches the generated database type key", () => {
    const key: PublicTables = TABLE_LESSON_READING_CONFIRMATIONS;
    expect(key).toBe("lesson_reading_confirmations");
  });

  it("CONFLICT_USER_BOOK_ACCESS matches the table's composite unique key", () => {
    expect(CONFLICT_USER_BOOK_ACCESS).toBe("user_id,book_id");
  });

  it("CONFLICT_EXERCISE_SUBMISSIONS matches the table's composite unique key", () => {
    expect(CONFLICT_EXERCISE_SUBMISSIONS).toBe("user_id,exercise_id");
  });

  it("CONFLICT_LESSON_READING_CONFIRMATIONS matches the table's composite unique key", () => {
    expect(CONFLICT_LESSON_READING_CONFIRMATIONS).toBe("user_id,lesson_id");
  });
});
