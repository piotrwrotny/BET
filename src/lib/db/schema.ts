/**
 * Canonical runtime identifiers for tables and constraints used by the
 * application layer. These are the single source of truth for string literals
 * that would otherwise be scattered through API routes and services.
 */

export const TABLE_USER_ROLES = "user_roles" as const;
export const TABLE_USER_BOOK_ACCESS = "user_book_access" as const;
export const TABLE_BOOKS = "books" as const;
export const TABLE_CHAPTERS = "chapters" as const;
export const TABLE_LESSONS = "lessons" as const;
export const TABLE_EXERCISES = "exercises" as const;
export const TABLE_EXERCISE_KEYS = "exercise_keys" as const;
export const TABLE_LESSON_PROGRESS = "lesson_progress" as const;
export const TABLE_EXERCISE_SUBMISSIONS = "exercise_submissions" as const;
export const TABLE_LESSON_READING_CONFIRMATIONS = "lesson_reading_confirmations" as const;

export const CONFLICT_USER_BOOK_ACCESS = "user_id,book_id" as const;
export const CONFLICT_EXERCISE_SUBMISSIONS = "user_id,exercise_id" as const;
export const CONFLICT_LESSON_READING_CONFIRMATIONS = "user_id,lesson_id" as const;
