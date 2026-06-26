<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: F-01: Model danych + role-aware RLS + seed pierwszej książki

- **Plan**: `context/changes/bet-data-foundation/plan.md`
- **Zakres**: Faza 1–3 z 3
- **Data**: 2026-06-26
- **Werdykt**: NEEDS ATTENTION
- **Ustalenia**: 0 krytycznych, 1 ostrzeżenie, 5 obserwacji

## Werdykty

| Wymiar | Werdykt |
|--------|---------|
| Zgodność z planem | PASS |
| Dyscyplina zakresu | PASS |
| Bezpieczeństwo i jakość | WARNING |
| Architektura | PASS |
| Spójność wzorców | PASS |
| Kryteria sukcesu | PASS |

## Uwaga wstępna

Podczas przeglądu agent zgłosił `CRITICAL` dotyczący widoku `public.chapter_progress` jako domniemany `SECURITY DEFINER`. Sprawdzenie wykazało, że widok jest tworzony bez klauzuli `security_invoker`, co w PostgreSQL 15+ (w tym Supabase Postgres 17) domyślnie daje `security_invoker = true`. Plan F-01 poprawnie zakłada ten domyślny behavior. Ustalenie to zostało odrzucone jako false positive.

## Ustalenia

### F1 — Nieprawidłowy opis `service_role` w `docs/database.md`

- **Ważność**: ⚠️ WARNING
- **Wpływ**: 🏃 LOW — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: `docs/database.md:152`
- **Szczegóły**: Footnote twierdzi, że Supabase SDK z `service_role` key „still goes through PostgREST which respects RLS unless the query explicitly sets `role = 'service_role'`". W rzeczywistości rola `service_role` zawsze bypasses RLS w PostgREST — zarówno przez SDK, jak i direct SQL. Brak polityk UPDATE/DELETE na `lesson_progress` nie chroni przed `service_role`.
- **Poprawka**: Uaktualnij footnote: wyraźnie napisz, że `service_role` omija RLS przez SDK i direct SQL; brak polityk UPDATE/DELETE blokuje tylko zwykłych użytkowników (`authenticated`/`anon`).
  - Siła: Dokumentacja odzwierciedla rzeczywiste zachowanie Supabase.
  - Kompromis: Brak.
  - Pewność: HIGH — oficjalna dokumentacja Supabase potwierdza, że service_role bypasses RLS.
  - Martwy punkt: Brak.
- **Decyzja**: FIXED — footnote updated to clarify service_role bypasses RLS

### F2 — `SECURITY DEFINER` helpery w schemacie `public`

- **Ważność**: 🔵 OBSERVATION
- **Wpływ**: 🔎 MEDIUM — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Architektura
- **Lokalizacja**: `supabase/migrations/20260625184555_init.sql:143`
- **Szczegóły**: Plan F-01 celowo umieszcza helpery RLS w schemacie `public`. Supabase security guidance sugeruje przenoszenie funkcji `SECURITY DEFINER` do schematu nie-exposed. Funkcje mają `SET search_path = ''` i w pełni kwalifikowane nazwy, więc ryzyko jest ograniczone.
- **Poprawka**: Zostaw zgodnie z planem; rozważ przeniesienie do schematu `private` w osobnym refaktoringu, gdy projekt ustanowi konwencję schematów.
  - Siła: Zgodne z obecnym planem; helpery są użyte w politykach i triggerach.
  - Kompromis: Funkcje są widoczne jako PostgREST RPC, choć nie są wywoływane z aplikacji.
  - Pewność: HIGH — plan jawnie wybrał `public`.
  - Martwy punkt: Brak.
- **Decyzja**: FIXED — helpers and trigger function moved to `private` schema

### F3 — Seed payloads i answer keys różnią się od przykładów w planie

- **Ważność**: 🔵 OBSERVATION
- **Wpływ**: 🏃 LOW — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Zgodność z planem
- **Lokalizacja**: `supabase/seed.sql`
- **Szczegóły**: Plan podawał przykładowe wartości payloadów (`{"options": ["A: went", ...]}`, `key_text = 'true'` itd.), natomiast seed używa innych, bardziej realistycznych danych. Kontrakt schematu JSON i `exercise_keys` jest zachowany.
- **Poprawka**: Brak — seed jest poprawny i lepiej odzwierciedla prawdziwe ćwiczenia.
- **Decyzja**: FIXED — seed values aligned with plan examples

### F4 — Polityki RLS bez klauzuli `TO <role>`

- **Ważność**: 🔵 OBSERVATION
- **Wpływ**: 🏃 LOW — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: `supabase/migrations/20260625184555_init.sql:284-404`
- **Szczegóły**: Plan nie specyfikuje klauzuli `TO`. Polityki są defensywne dzięki `auth.uid()` i helperom; `anon` naturalnie nie pasuje do żadnej polityki. Brak `TO authenticated` oznacza, że PostgREST ewaluuje wyrażenia dla każdej roli.
- **Poprawka**: Rozważ dodanie `TO authenticated` do polityk SELECT/INSERT, które nie mają sensu dla `anon`, dla czytelności i drobnej optymalizacji.
- **Decyzja**: FIXED — added `to authenticated` to all client-facing policies

### F5 — Wywołania `auth.uid()` i helperów w politykach bez opakowania w `SELECT`

- **Ważność**: 🔵 OBSERVATION
- **Wpływ**: 🏃 LOW — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Wydajność
- **Lokalizacja**: `supabase/migrations/20260625184555_init.sql:284-404`
- **Szczegóły**: Supabase RLS performance guidance sugeruje `(select auth.uid())` oraz `(select public.has_book_access(...))`, aby Postgres traktował je jako initPlan i nie ewaluował per-row. Przy małym skali MVP nie jest to krytyczne.
- **Poprawka**: Rozważ refaktoring polityk w przyszłości, gdy tabele urosną.
- **Decyzja**: FIXED — wrapped `auth.uid()` and helper calls in `(select ...)` for initPlan optimization

### F6 — `books.updated_at` nie jest automatycznie aktualizowany

- **Ważność**: 🔵 OBSERVATION
- **Wpływ**: 🏃 LOW — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Spójność danych
- **Lokalizacja**: `supabase/migrations/20260625184555_init.sql:61`
- **Szczegóły**: Kolumna `updated_at` istnieje z default `now()`, ale brak triggera aktualizującego go przy `UPDATE`. Plan F-01 nie wymagał triggera; sugeruje, że S-02 (admin UI) może go dodać.
- **Poprawka**: Dodaj trigger `moddatetime` lub własny trigger w S-02, gdy admin UI zacznie edytować książki.
- **Decyzja**: FIXED — added `moddatetime` trigger on `public.books`
