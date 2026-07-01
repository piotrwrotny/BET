/**
 * Canonical runtime identifiers for tables and constraints used by the
 * application layer. These are the single source of truth for string literals
 * that would otherwise be scattered through API routes and services.
 */

export const TABLE_USER_ROLES = "user_roles" as const;
export const TABLE_USER_BOOK_ACCESS = "user_book_access" as const;
export const TABLE_BOOKS = "books" as const;

export const CONFLICT_USER_BOOK_ACCESS = "user_id,book_id" as const;
