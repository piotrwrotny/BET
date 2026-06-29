# Plan wdrożenia: admin-user-book-access-management

## Przegląd

Przywrócenie i dopracowanie panelu admina `/admin/users` do zarządzania studentami oraz ich przypisanymi książkami. Feature był wcześniej zaimplementowany w ramach S-03 (`admin-user-and-access-mgmt`), następnie wyciągnięty z S-02 jako scope drift, a obecnie jest przywracany jako samodzielna zmiana.

W obecnym modelu dostęp do treści jest otwarty dla wszystkich uwierzytelnionych studentów (F-9 w S-02). `user_book_access` przestaje więc pełnić rolę gate'a dostępu, a staje się rejestrem **przypisanych / rekomendowanych książek** dla studenta. Admin może nadal przypisywać i odbierać te przypisania, ale nie wpływa to na możliwość przeczytania książki przez studenta.

## Analiza stanu obecnego

**Już gotowe:**
- Schema DB: `user_roles`, `user_book_access`, RLS, trigger `handle_new_user` (F-01).
- Middleware chroni `/admin/*` i ustawia `locals.role`.
- `createAdminClient()` w `src/lib/supabase.ts` pozwala listować `auth.users` serwerowo.
- Kod oryginalny został przywrócony z commitu `8671751`:
  - `src/components/admin/UsersTable.tsx`
  - `src/pages/admin/users.astro`
  - `src/lib/services/user-admin.ts`
  - `src/pages/api/admin/users.ts`
  - `src/pages/api/admin/users/[id]/grant.ts`
  - `src/pages/api/admin/users/[id]/revoke.ts`
  - link w `src/layouts/AdminLayout.astro`

**Brakuje / wymaga poprawek:**
- API routes używają `new Response(JSON.stringify(...))` zamiast `Response.json(...)` — brak spójności z S-02.
- API routes nie sprawdzają Origin/Referer (CSRF) — reguła z S-02.
- `revoke.ts` usuwa wszystkie książki użytkownika, a nie konkretną parę `(user_id, book_id)`.
- `UsersTable.tsx` po wyborze książki nadpisuje `books` jedną książką (UI single-book zamiast multi-book).
- `user-admin.ts` zwraca wszystkich użytkowników, w tym adminów.
- `user-admin.ts` wywołuje `auth.admin.listUsers()` bez paginacji — ryzyko cichego ucięcia do 50 rekordów.
- Brak `safeDecodeURIComponent` / obsługi błędów w stylu S-02 na stronie Astro.

## Pożądany stan końcowy

1. `/admin/users` widoczne w sidebarze i działające dla admina.
2. Tabela pokazuje **tylko studentów** (email, rola, przypisane książki, data rejestracji).
3. Admin może przypisać studentowi wiele książek (multi-select / combobox) i usuwać konkretne przypisania.
4. API zwraca JSON przez `Response.json(...)`, sprawdza rolę admina, waliduje UUID i chroni przed CSRF.
5. Serwis paginuje `listUsers()` i scope'uje wynik do ról `student`.
6. `tsc --noEmit` i `npm run build` przechodzą bez błędów.

## Czego NIE robimy

- Nie przywracamy `user_book_access` jako gate'a dostępu — pozostaje otwarty dostęp (F-9).
- Nie dodajemy promowania ról admin ↔ student.
- Nie dodajemy usuwania / blokowania kont.
- Nie wysyłamy maili do studentów.
- Nie budujemy paginacji UI — dane ładowane serwerowo, sortowanie/filtrowanie client-side na pełnej liście.
- Nie dodajemy audit logu.
- Nie dodajemy CASL (nadmiarowe dla dwóch ról i jednej akcji).

## Podejście do implementacji

### Faza 1: Serwis i API — poprawki kontraktowe

1. **`src/lib/services/user-admin.ts`**
   - Paginacja `auth.admin.listUsers()` (pętla po `page` aż pusta strona).
   - Filtrowanie do ról `student` (pobranych z `user_roles`).
   - Zachowanie many-to-many w `books`.

2. **`src/pages/api/admin/users.ts`**
   - Zamiana na `Response.json(...)`.
   - Dodanie CSRF guard (Origin/Referer check).

3. **`src/pages/api/admin/users/[id]/grant.ts`**
   - Zamiana na `Response.json(...)`.
   - Dodanie CSRF guard.
   - Zachowanie upsertu `(user_id, book_id)`.

4. **`src/pages/api/admin/users/[id]/revoke.ts`**
   - Zamiana na `Response.json(...)`.
   - Dodanie CSRF guard.
   - Zmiana z usuwania wszystkich książek na usuwanie konkretnej pary przez query param `book_id`.

### Faza 2: UI — multi-book i integracja

1. **`src/pages/admin/users.astro`**
   - Dodanie `pageError` + `<ServerError>` w stylu stron admina.
   - Fail-fast przy błędzie pobierania użytkowników lub książek.

2. **`src/components/admin/UsersTable.tsx`**
   - Zmiana z single-select na multi-select dla przypisanych książek.
   - Dodawanie książki przez combobox/dropdown bez nadpisywania istniejących.
   - Usuwanie konkretnej książki przez chip z `×`.
   - Filtrowanie "Tylko oczekujący" pokazuje studentów bez przypisanych książek.
   - Optymistyczna aktualizacja stanu lokalnego + refetch po sukcesie.

### Faza 3: Weryfikacja

- `npx tsc --noEmit`
- `npm run build`
- Ręczny smoke test: admin widzi studentów, może dodać i usunąć przypisanie książki.

## Krytyczne szczegóły implementacji

**CSRF guard:** Wzorzec z S-02 — porównanie `Origin`/`Referer` z `Astro.url.origin`. Dla API routes bezpośrednio z requestu.

**Paginacja `listUsers()`:** Supabase domyślnie zwraca 50 użytkowników. Iterujemy `page=1,2,...` z `perPage=100` (maksymalne dozwolone) do momentu pustej strony.

**Multi-book UI:** Zamiast `Select` zastosujemy `MultiSelect` / combobox z istniejących komponentów shadcn/ui lub prosty custom (button + dropdown + chips). Priorytet: działający MVP, nie idealny UX.

**Open access vs przypisania:** W szablonie dashboardu i na stronie lekcji nie zmieniamy logiki open access. `user_book_access` jest czytane tylko przez panel admina i ewentualnie w przyszłości do rekomendacji.

## Strategia testowania

### Automatyczna
- `npx tsc --noEmit`
- `npm run build`

### Ręczna
1. Zaloguj jako admin → `/admin/users` widoczne w sidebarze.
2. Tabela pokazuje studentów (bez adminów).
3. Dodaj studentowi dwie książki — obie widoczne jako chipy.
4. Usuń jedną książkę — druga pozostaje.
5. Filtr "Tylko oczekujący" ukrywa studentów z przypisanymi książkami.
6. Nie-admin na `/admin/users` → redirect `/dashboard` (middleware).
7. POST/DELETE jako student → 403.

## Postęp

### Faza 1: Serwis i API

#### Automatyczne
- [x] 1.1 `user-admin.ts` paginuje listUsers i scope'uje do studentów
- [x] 1.2 `users.ts` używa `Response.json` i CSRF guard
- [x] 1.3 `grant.ts` używa `Response.json` i CSRF guard
- [x] 1.4 `revoke.ts` używa `Response.json`, CSRF guard i usuwa konkretną parę `(user_id, book_id)`
- [x] 1.5 `npm run build` przechodzi

#### Ręczne
- [ ] 1.6 Admin widzi JSON z `GET /api/admin/users` w przeglądarce
- [ ] 1.7 Nie-admin dostaje 403 na `/api/admin/users`

### Faza 2: UI

#### Automatyczne
- [x] 2.1 `src/pages/admin/users.astro` renderuje się bez błędów build
- [x] 2.2 `UsersTable.tsx` bez błędów TypeScript
- [x] 2.3 `npm run build` przechodzi

#### Ręczne
- [ ] 2.4 Tabela pokazuje tylko studentów
- [ ] 2.5 Multi-book przypisanie działa (dodawanie i usuwanie)
- [ ] 2.6 Filtr "Tylko oczekujący" działa
- [ ] 2.7 Nie-admin redirectowany z `/admin/users`
