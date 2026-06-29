<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Nawigacja sekwencyjna i ukończenie rozdziału

- **Plan**: `context/changes/sequential-navigation-and-chapter-completion/plan.md`
- **Zakres**: Pełny plan (Faza 1 + Faza 2)
- **Data**: 2026-06-29
- **Werdykt**: APPROVED (after fixes)
- **Ustalenia**: 0 krytycznych, 6 ostrzeżeń, 1 obserwacja — wszystkie naprawione

## Werdykty

| Wymiar | Werdykt |
|--------|---------|
| Zgodność z planem | PASS |
| Dyscyplina zakresu | PASS |
| Bezpieczeństwo i jakość | WARNING |
| Architektura | PASS |
| Spójność wzorców | WARNING |
| Kryteria sukcesu | PASS |

## Weryfikacja automatyczna

| Polecenie | Wynik |
|-----------|-------|
| `npx tsc --noEmit` | PASS (brak błędów) |
| `npm run build` | PASS (build complete) |

## Ustalenia

### F1 — Struktura nagłówka lekcji odbiega od planu

- **Ważność**: ⚠️ WARNING
- **Wpływ**: 🏃 LOW — szybka decyzja; poprawka kosmetyczna
- **Wymiar**: Zgodność z planem
- **Lokalizacja**: `src/pages/lessons/[id].astro:169-226`
- **Szczegóły**: Plan zakładał jeden inline `<header>` zawierający `← Dashboard`, `← prev`, badge lekcji/rozdziału oraz `next →`. Implementacja używa dwóch osobnych pasków: górnego (Dashboard + badge rozdziału) i dolnego (prev/next). Ponadto badge rozdziału ma tekst `✓ Rozdział ukończony` zamiast planowanego `✓ Rozdział ukończony!`, a etykieta cross-chapter renderowana jest jako podtytuł nad tytułem lekcji, a nie inline `Rozdział 2 →` / `← Chapter 1: title`.
- **Poprawka**: Dostosuj strukturę nagłówka do kontraktu planu — jeden inline pasek z wszystkimi elementami i wykrzyknikiem w badge.
  - Siła: Zgodność z planem i spójniejsze UX.
  - Kompromis: Kosmetyczna zmiana szablonu; wymaga drobnego przesunięcia elementów.
  - Pewność: HIGH — plan zawiera dokładny kod docelowy.
  - Martwy punkt: Brak znaczących.
- **Decyzja**: FIXED — Restrukturyzowano nagłówek do jednego inline paska zgodnie z kontraktem planu; dodano wykrzyknik do badge; cross-chapter labels renderowane inline.

### F2 — Brak walidacji UUID w parametrze trasowania lekcji

- **Ważność**: ⚠️ WARNING
- **Wpływ**: 🔎 MEDIUM — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: `src/pages/lessons/[id].astro:7,28`
- **Szczegóły**: `Astro.params.id` jest rzutowane na `string` i przekazywane bezpośrednio do `.eq('id', id as string)`. Brak walidacji kształtu UUID i obsługi `undefined`; przy błędnym formacie zapytanie zwraca 0 wierszy lub wywołuje nieoczekiwany błąd `.single()`, a użytkownik jest przekierowywany na `/dashboard` bez wyjaśnienia.
- **Poprawka**: Waliduj `Astro.params.id` schematem Zod / regexem UUID przed zapytaniem i zwracaj 404 dla nieprawidłowego identyfikatora.
  - Siła: Jasny komunikat błędu, spójność z resztą aplikacji, eliminacja cichych redirectów.
  - Kompromis: Dodatkowa linia walidacji w frontmatterze.
  - Pewność: HIGH — w repo istnieje już `uuidSchema` w `src/lib/utils.ts`.
  - Martwy punkt: Brak znaczących.
- **Decyzja**: FIXED — Dodano walidację `Astro.params.id` za pomocą `uuidSchema` z `src/lib/utils.ts`; nieprawidłowe UUID przekierowuje na `/dashboard?error=...`.

### F3 — Brak obsługi błędów w zapytaniach nawigacyjnych i progress

- **Ważność**: ⚠️ WARNING
- **Wpływ**: 🔎 MEDIUM
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: `src/pages/lessons/[id].astro:20-165`
- **Szczegóły**: Wyniki zapytań o lekcję, rodzeństwo, poprzedni/następny rozdział oraz `chapter_progress` są destrukturyzowane tylko jako `{ data: ... }`; brak sprawdzenia `error`. Awaria sieciowa, błąd RLS lub problem z bazą powoduje cichą degradację UI (brak nawigacji lub badge) zamiast wyraźnego komunikatu.
- **Poprawka**: Sprawdzaj `error` dla każdego zapytania lub przynajmniej loguj błędy i wyświetlaj fallback UI / `ServerError`.
  - Siła: Lepsza debugowalność i UX przy awariach.
  - Kompromis: Więcej kodu obsługi błędów w frontmatterze.
  - Pewność: HIGH — wzorzec `ServerError` jest już używany na dashboardzie i stronach admina.
  - Martwy punkt: Brak znaczących.
- **Decyzja**: FIXED — Dodano sprawdzanie `error` dla zapytań o lekcję, rodzeństwo, poprzedni/następny rozdział oraz `chapter_progress`; błędy powodują przekierowanie na `/dashboard?error=...`.

### F4 — Nieoptymalne zapytanie cross-chapter pobiera wszystkie lekcje sąsiedniego rozdziału

- **Ważność**: ⚠️ WARNING
- **Wpływ**: 🏃 LOW
- **Wymiar**: Bezpieczeństwo i jakość (wydajność)
- **Lokalizacja**: `src/pages/lessons/[id].astro:112-155`
- **Szczegóły**: Zapytanie do `chapters` osadza relację `lessons(id, title, ord)`, pobierając wszystkie lekcje sąsiedniego rozdziału, a następnie sortuje je i wybiera jedną po stronie klienta. W rozdziałach z wieloma lekcjami marnuje to transfer i pamięć.
- **Poprawka**: Zamiast osadzać wszystkie lekcje rozdziału, zapytaj bezpośrednio tabeli `lessons` z `eq('chapter_id', ...)`, odpowiednim `order('ord', ...)` i `limit(1)`.
  - Siła: Mniejsze zapytanie, mniej danych po sieci, prostszy kod.
  - Kompromis: Wymaga dwóch zapytań (chapter + lesson) zamiast jednego osadzonego; nadal warunkowe tylko na granicach.
  - Pewność: HIGH — RLS na `lessons` jest już skonfigurowane.
  - Martwy punkt: Nie mierzono rzeczywistego wpływu wydajnościowego.
- **Decyzja**: FIXED — Zastąpiono osadzoną relację `lessons` w query `chapters` bezpośrednim zapytaniem do tabeli `lessons` z `eq('chapter_id', ...)`, `order('ord', ...)` i `limit(1)`.

### F5 — Dashboard nadpisuje `pageError` i kontynuuje zapytania po błędzie

- **Ważność**: ⚠️ WARNING
- **Wpływ**: 🔎 MEDIUM
- **Wymiar**: Spójność wzorców / Niezawodność
- **Lokalizacja**: `src/pages/dashboard.astro:29-72`
- **Szczegóły**: Każde zapytanie nadpisuje `pageError`, więc użytkownik widzi tylko ostatni błąd. Po błędzie w jednym zapytaniu kolejne są nadal wykonywane, marnując round-tripy. Strony admina stosują wzorzec fail-fast (zatrzymują dalsze zapytania), dashboard go nie stosuje.
- **Poprawka A ⭐ Zalecana**: Użyj `else if` / early return, aby przerwać dalsze zapytania po pierwszym błędzie, zgodnie ze wzorcem admina.
  - Siła: Spójność z resztą aplikacji, mniej zbędnych zapytań.
  - Kompromis: Dashboard może pokazywać mniej informacji przy częściowej awarii.
  - Pewność: HIGH — wzorzec znany ze stron admina.
  - Martwy punkt: Brak znaczących.
- **Poprawka B**: Zbieraj listę błędów i wyświetl wszystkie.
  - Siła: Użytkownik widzi pełny obraz awarii.
  - Kompromis: Więcej kodu, mniej konsekwentny z resztą aplikacji.
  - Pewność: MEDIUM — wymaga dodatkowej struktury danych.
  - Martwy punkt: Brak znaczących.
- **Decyzja**: FIXED (Poprawka A) — Zmieniono dashboard na wzorzec fail-fast: kolejne zapytania wykonywane są tylko gdy `!pageError`.

### F6 — `book.cover_url` renderowany bez walidacji schematu URL

- **Ważność**: ⚠️ WARNING
- **Wpływ**: 🏃 LOW
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: `src/pages/dashboard.astro:128-129`
- **Szczegóły**: Wartość `cover_url` pochodząca z bazy jest wstawiana bezpośrednio do atrybutu `<img src>`. Brak walidacji protokołu pozwala na teoretyczne użycie szkodliwego adresu (`javascript:`, `data:`), co może prowadzić do wektorów XSS lub phishingu. W panelu admina dodano już ograniczenie do `http://`/`https://` przy zapisie (S-02), ale strona studenta nie waliduje przy odczycie.
- **Poprawka**: Waliduj `cover_url` (wymagaj protokołu `http:`/`https:`) przed renderowaniem lub użyj komponentu bezpiecznie obsługującego obrazki.
  - Siła: Obrona w głębi — nawet jeśli dane w bazie zostaną zatrute, strona studenta ich nie wykorzysta.
  - Kompromis: Drobnna zmiana w szablonie / frontmatterze.
  - Pewność: HIGH — wzorzec walidacji URL już istnieje w admin API.
  - Martwy punkt: Brak znaczących.
- **Decyzja**: FIXED — Utworzono komponent `src/components/ui/SafeImage.astro` walidujący protokół URL (`http:`/`https:`) i renderujący placeholder dla nieprawidłowych adresów; zastosowano go w dashboardzie.

### F7 — `marked.parse` rzutowane na string bez obsługi async

- **Ważność**: 💬 OBSERVATION
- **Wpływ**: 🏃 LOW
- **Wymiar**: Niezawodność
- **Lokalizacja**: `src/pages/lessons/[id].astro:35`
- **Szczegóły**: `marked.parse(lesson.content)` jest rzutowane na `string`. W obecnej konfiguracji `marked` działa synchronicznie, ale jeśli w przyszłości zostanie włączone rozszerzenie async, wynikiem będzie `Promise`, a `sanitizeHtml` zacznie operować na `[object Promise]`.
- **Poprawka**: Użyj `await marked.parse(...)` z wyraźną obsługą async lub jawnie skonfiguruj `marked` w trybie synchronicznym.
  - Siła: Zapobiega cichym regresjom przy zmianie konfiguracji markdown.
  - Kompromis: Minimalna zmiana; `marked.parse` w wersji synchronicznej zwraca string lub Promise w zależności od opcji.
  - Pewność: MEDIUM — zależy od wersji `marked` i przyszłych rozszerzeń.
  - Martwy punkt: Nie sprawdzono dokładnej wersji `marked`.
- **Decyzja**: FIXED — Zmieniono `marked.parse(...)` na `await marked.parse(...)` dla bezpiecznej obsługi ewentualnych przyszłych rozszerzeń asynchronicznych.
