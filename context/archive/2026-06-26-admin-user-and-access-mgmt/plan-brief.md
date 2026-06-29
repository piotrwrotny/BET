# S-03 admin-user-and-access-mgmt — Krótki plan

> Pełny plan: `context/changes/admin-user-and-access-mgmt/plan.md`
> Badania: `context/changes/admin-user-and-access-mgmt/research.md`

## Co i dlaczego

Admin BET potrzebuje własnego ekranu do zarządzania studentami: widzieć kto się zarejestrował, kto czeka na pierwszą książkę i jednym kliknięciem nadawać lub odbierać dostęp do konkretnego podręcznika. Bez tego student po self-service signupie trafia na pusty dashboard — nie wie, że musi poczekać na admina.

## Punkt wyjścia

- Schema DB gotowe: `user_roles` (admin/student) i `user_book_access` z pełnymi politykami RLS (F-01).
- Middleware i API routes admina używają `locals.role` — solidny layer-cake autoryzacji.
- Panel admina istnieje ale ma tylko Książki / Rozdziały / Lekcje / Ćwiczenia.
- **Brakuje**: `SUPABASE_SERVICE_ROLE_KEY` oraz jakiegokolwiek klienta do listowania użytkowników `auth.users`.

## Pożądany stan końcowy

Admin otwiera `/admin/users` i widuje tabelę wszystkich studentów z filtrami: "Wszyscy" / "Oczekujący" (bez książki). W wierszu tabeli dropdown z listą książek — wybór przyznaje dostęp. Obok przycisk "Odbierz" dla studentów z już przypisaną książką.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego | Źródło |
|---|---|---|---|
| Model "oczekujących" | Automatyczny filtr bez `user_book_access` | Zero migracji schema; proste `NOT EXISTS` w zapytaniu | Plan |
| Zarządzanie rolami | Tylko przeglądanie + nadawanie książek | Unika eskalacji i ryzyka samodegradacji admina | Plan |
| UX przyznawania książki | Inline Select w wierszu tabeli | Najszybszy workflow; jedno kliknięcie | Plan |
| Kontrola widoczności UI | Lightweight `useIsAdmin()` zamiast CASL | 2 role wystarczają podstawowe sprawdzenie; brak nowych deps | Badania |
| Usuwanie kont | Nie w MVP | Ochrona przed przypadkowym usunięciem postępu studenta | Plan |
| TanStack Table tryb | Display-only (client-side sort na danych z Astro) | Astro frontmatter fetchuje wszystko serwerowo; brak potrzeby server-sync | Badania |
| Service role key | Tylko w API routes, nigdy w przeglądarce | Bezpieczeństwo: `SUPABASE_SERVICE_ROLE_KEY` nie wychodzi z serwera | Badania |

## Zakres

**W zakresie:**
- Zmienna `SUPABASE_SERVICE_ROLE_KEY` + serwerowy `createAdminClient()`
- API route `GET /api/admin/users` (listUsers + join user_roles + user_book_access)
- API route `POST /api/admin/users/[id]/grant` (INSERT `user_book_access`)
- API route `DELETE /api/admin/users/[id]/revoke` (DELETE `user_book_access`)
- Strona `/admin/users` z TanStack Table i inline Select
- Link "Użytkownicy" w AdminLayout sidebar
- Zod walidacja na wszystkich API routes

**Poza zakresem:**
- Promowanie/demotion ról
- Usuwanie / blokowanie kont
- Wyszukiwanie globalne po email (client-side sort wystarcza dla MVP)
- Audit log / soft-delete
- Paginacja serwerowa (lista studentów w MVP jest krótka)
- Wysyłanie emaili / workflow invite

## Architektura / Podejście

```
┌─────────────┐     ┌─────────────────────┐     ┌──────────────────┐
│ /admin/users│────▶│ Astro frontmatter   │────▶│ GET /api/admin   │
│ (Astro page)│     │ fetch GET /api/admin│     │ /users           │
└─────────────┘     │ /users              │     │ (APIRoute)       │
                     └─────────────────────┘     └────────┬─────────┘
                                                          │
                     ┌─────────────────────┐              │ createAdminClient()
                     │ React island        │◄─────────────┘ (service_role)
                     │ UsersTable.tsx      │          listUsers()
                     │ (TanStack Table)    │          + user_roles
                     │ + shadcn/ui Select  │          + user_book_access
                     └─────────┬───────────┘
                               │ onValueChange
                               │ fetch POST /api/admin/users/[id]/grant
                               │ fetch DELETE /api/admin/users/[id]/revoke
                               ▼
                        └─────────────┐
                        │ RLS na user │
                        │ _book_access│
                        │ (admin-only)│
                        └─────────────┘
```

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
|------|-------------|-----------------|
| 1. Backend | `createAdminClient()`, 3 API routes, Zod schemas | `SUPABASE_SERVICE_ROLE_KEY` w Cloudflare Workers — wymaga `wrangler secret put` |
| 2. Frontend + testy | `/admin/users` z DataTable, inline Select, AdminLayout nav | TanStack Table island może się błędnie hydratować jeśli dane serwerowe nie są zserializowane poprawnie |

**Wymagania wstępne:** F-01 (schema + RLS) musi być na miejscu. OQ-1 rozstrzygnięte (self-service signup).
**Szacowany wysiłek:** ~2-3 sesje w 2 fazach (średnia złożoność).

## Otwarte ryzyka i założenia

- Cloudflare Workers wymaga `SUPABASE_SERVICE_ROLE_KEY` jako secret (nie `.env`). W dev używamy `.dev.vars`.
- `supabase.auth.admin.listUsers()` może mieć rate limits — dla MVP lista jest krótka, ale przy 100+ użytkownikach trzeba będzie dodać paginację.
- Weryfikacja `email_confirm = true` — czy wszyscy studenci po signupie mają potwierdzony email? Research wykazał że signup przekierowuje do `/auth/confirm-email`.

## Kryteria sukcesu (podsumowanie)

- Admin widzi listę wszystkich studentów z ich rolami i przypisanymi książkami.
- Admin filtruje "Oczekujących" (bez książki) jednym kliknięciem.
- Admin przyznaje i odbiera dostęp do książki inline — zmiana widoczna natychmiast bez reload.
- Nie-admin trafiający na `/admin/users` jest redirectowany do `/dashboard`.
