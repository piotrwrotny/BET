---
change_id: admin-user-book-access-management
title: Admin zarządza dostępem studentów do książek
status: new
created: 2026-06-29
updated: 2026-06-29
archived_at: null
---

## Notes

Wydzielony z S-02 (`admin-content-creation`) feature zarządzania użytkownikami / `user_book_access`. Kod został zaimplementowany ad-hoc w ramach S-02 mimo że plan S-02 wykluczał `user_book_access` i `Role management UI`. Podczas implementation review S-02 został oznaczony jako F2 — CRITICAL scope drift.

Zawiera obecnie:
- `src/components/admin/UsersTable.tsx`
- `src/pages/admin/users.astro`
- `src/lib/services/user-admin.ts`
- `src/pages/api/admin/users.ts`
- `src/pages/api/admin/users/[id]/grant.ts`
- `src/pages/api/admin/users/[id]/revoke.ts`
- link "Użytkownicy" w `src/layouts/AdminLayout.astro`

Do przemyślenia:
- Czy ten feature jest rzeczywiście potrzebny w MVP?
- Service-role client w `user-admin.ts` — czy to akceptowalne ryzyko?
- Relacja z dashboard studenta (`user_book_access` gating).
