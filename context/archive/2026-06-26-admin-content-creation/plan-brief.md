# Admin Content Creation (S-02) — Krótki plan

> Pełny plan: `context/changes/admin-content-creation/plan.md`
> Badania: `context/changes/admin-content-creation/research.md`

## Co i dlaczego

Admin potrzebuje panelu CRUD do tworzenia treści kursu bez SQL: książki, rozdziały, lekcje z Markdown, ćwiczenia z kluczami odpowiedzi. Bez tego admin musi ręcznie edytować seed SQL przy każdej zmianie treści — co blokuje produktywne zarządzanie kursem.

## Punkt wyjścia

Wszystkie 5 tabel (`books`, `chapters`, `lessons`, `exercises`, `exercise_keys`) istnieje z kompletem write RLS policies opartych na `is_admin()`. Brak jakichkolwiek stron `/admin/*`, API routes dla CRUD, layoutu adminowego — i brak zabezpieczenia trasy `/admin` w middleware.

## Pożądany stan końcowy

Admin (`admin@bet.local`) może przez UI przejść hierarchię Książki → Rozdziały → Lekcje → Ćwiczenia, tworząc i edytując treści. Lekcja z Markdown edytowana przez admina jest natychmiastowo widoczna studentowi przez niezmieniony render path. Student próbujący wejść na `/admin` trafia na `/dashboard`.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego (1 zdanie) | Źródło |
|---|---|---|---|
| Format treści lekcji | Markdown textarea + live preview | Zero nowych deps, `marked.parse()` w student render path bez zmian | Plan |
| Typy ćwiczeń w S-02 | MC + fill_in_blank + true_false | Tylko typy z istniejącym lub planowanym student renderer (S-06/S-07) | Plan |
| Okładka książki | URL tekstowy (wklejany) | Zero infrastruktury Storage, `books.cover_url text` already nullable | Plan |
| Admin role guard | Middleware centralny | Jeden blok w middleware.ts zamiast duplikacji per-strona | Plan |
| Layout admin panelu | Sidebar nawigacja | Typowy wzorzec admin panelu, łatwa nawigacja między poziomami hierarchii | Plan |
| Kolejność encji (ord) | Auto-append (`MAX(ord)+1`) | Brak race condition w single-admin MVP, zero UI reorder | Plan |
| Delete | fetch + confirm() inline | Brak potrzeby React island tylko dla delete, czyste HTML | Plan |
| Edit form submit | POST → UPDATE (nie PATCH) | HTML forms nie obsługują PATCH, osobny `/api/admin/[entity]/[id]` POST handler robi UPDATE | Plan |

## Zakres

**W zakresie:**
- Middleware role guard (`/admin` → 401/403 dla nie-adminów)
- `AdminLayout.astro` z sidebar nawigacją
- Shadcn `Input`, `Textarea`, `Select`, `Label` instalacja
- Pełny CRUD: books, chapters, lessons, exercises, exercise_keys
- `MarkdownEditor.tsx` — React island (textarea + live `marked` preview)
- `ExerciseForm.tsx` — React island (warunkowe pola per typ + zarządzanie kluczami)
- Ord auto-append per parent na INSERT

**Poza zakresem:**
- Reordering (drag-and-drop, numeryczne pola ord)
- Supabase Storage bucket dla okładek
- Typy ćwiczeń: `matching`, `sentence_transformation`, `open_ended`
- Zarządzanie `user_book_access` (dostęp studentów)
- Role management UI
- Paginacja list

## Architektura / Podejście

Flat URL schema per encja (`/admin/books`, `/admin/chapters?book_id=X`, itd.) z query params dla kontekstu rodzica. Proste encje (books, chapters, lessons) używają native HTML forms POSTujących do API routes, które zwracają redirect 302. Złożony formularz ćwiczeń = React island (`ExerciseForm.tsx`) submitujący JSON przez fetch. Delete przez inline `onclick` z `confirm()` + `fetch({method:'DELETE'})`. AdminLayout dostarcza sidebar. Supabase anon-key klient wystarczy dla write operations (RLS `is_admin()` sprawdza `auth.uid()`).

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
|---|---|---|
| 1. Infrastruktura | Middleware guard, AdminLayout z sidebarrem, shadcn form primitives, `/admin` entry | shadcn `npx` może wygenerować niezgodne pliki z v4 Tailwind |
| 2. Książki & Rozdziały | Pełny CRUD books + chapters z breadcrumb nawigacją | Edit form POST handler (nie PATCH) — niezwykły pattern |
| 3. Lekcje (Markdown) | CRUD lekcji z MarkdownEditor island + live preview | `marked` import w browser island — sprawdzić Workers compat |
| 4. Ćwiczenia & Klucze | ExerciseForm island + API z replace-all keys logic | MC walidacja krzyżowa (klucz musi być w options) |

**Wymagania wstępne:** F-01 zaimplementowane (gotowe). Supabase local running (`http://127.0.0.1:54321`). Admin user w seed (`admin@bet.local` / `admin-pass`).  
**Szacowany wysiłek:** ~4 sesje w 4 fazach (infrastruktura łatwa, exercises najtrudniejsze).

## Otwarte ryzyka i założenia

- Shadcn `add` z Tailwind v4 (config-in-CSS) może wygenerować komponenty z `import` path issues — weryfikacja po fazie 1
- `marked` jest używany server-side już teraz; import w browser island (`client:load`) powinien działać, ale Workers SSR edge nie jest testowany z tym importem
- Dashboard studenta może filtrować `books` przez `user_book_access` — nowo stworzone książki mogą nie być widoczne studentowi bez INSERT do `user_book_access`; sprawdzić w fazie 2
- Replace-all keys (faza 4) może zostawić exercise bez kluczy jeśli INSERT failuje po DELETE — akceptowalne ryzyko MVP

## Kryteria sukcesu (podsumowanie)

- Admin tworzy pełną hierarchię treści (książka → rozdział → lekcja → ćwiczenie MC) przez UI
- Student rozwiązuje nowo stworzone ćwiczenie MC poprawnie (klucz odpowiedzi działa)
- Student próbujący wejść na `/admin` trafia na `/dashboard`
