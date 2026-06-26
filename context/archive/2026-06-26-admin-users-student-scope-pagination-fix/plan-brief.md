# admin-users-student-scope-pagination-fix — Krótki plan

> Pełny plan: `context/changes/admin-users-student-scope-pagination-fix/plan.md`
> Badania: `context/changes/admin-user-and-access-mgmt/research.md`

## Co i dlaczego

Naprawiamy dwa błędy kontraktu listy użytkowników: panel `/admin/users` pokazuje też adminów oraz cicho ucina dane przy większej liczbie kont. To ryzyko operacyjne — admin pracuje na niepełnym lub niepoprawnym zbiorze.

## Punkt wyjścia

Dzisiejsza logika w `user-admin.ts` bierze wszystkich auth users i woła `listUsers()` bez paginacji. API i strona Astro konsumują ten sam serwis, więc oba błędy propagują się jednocześnie.

## Pożądany stan końcowy

Panel `/admin/users` pokazuje wyłącznie studentów i nie traci rekordów przy 51+ kontach. Gdy dane users są niepełne lub niedostępne, UI pokazuje twardy błąd i nie renderuje tabeli, zamiast udawać poprawny stan.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego (1 zdanie) | Źródło |
| --- | --- | --- | --- |
| Scope danych | Student-only w serwisie | Jedno źródło prawdy dla API i SSR, brak duplikacji filtrów | Plan |
| Paginacja users | Pętla `page/perPage` do końca | Eliminuje silent truncation także po dalszym wzroście danych | Plan + Badania |
| Źródło danych | Wspólny serwis dla API i `.astro` | Utrzymuje spójny kontrakt między endpointem i stroną | Plan |
| Obsługa błędu | Hard fail + banner | Lepsze jawne zepsucie niż ciche pokazanie niepełnych danych | Plan |

## Zakres

**W zakresie:**
- `src/lib/services/user-admin.ts`: paginacja + student scope
- `src/pages/api/admin/users.ts`: spójny kontrakt odpowiedzi/błędu
- `src/pages/admin/users.astro`: brak renderu tabeli przy błędzie
- Weryfikacja manualna scenariuszy `admin-in-list` i `>50 users`

**Poza zakresem:**
- Migracje DB i zmiany RLS
- Przebudowa UI tabeli users
- Nowe endpointy lub nowy model ról

## Architektura / Podejście

Fix siedzi w warstwie serwisu users. Najpierw serwis zwraca poprawny zbiór (pełna paginacja, tylko studenci), potem konsumenci tylko dziedziczą kontrakt. Dzięki temu jedna zmiana naprawia API i SSR naraz.

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Serwis users | Poprawny kontrakt danych (student-only + paginacja) | Błąd pętli paginacji może zostawić partial data |
| 2. Konsumenci i UX błędu | Spójność API/SSR + twardy błąd w UI | Użytkownik może stracić widok tabeli przy krótkim incydencie backend |

**Wymagania wstępne:** działające `SUPABASE_SERVICE_ROLE_KEY`, lokalny seed users, dostęp admin.
**Szacowany wysiłek:** ~1-2 sesje, 2 fazy.

## Otwarte ryzyka i założenia

- Dataset >50 może wymagać przygotowania kont testowych lokalnie.
- Supabase API rate/latency wzrośnie liniowo z liczbą stron.

## Kryteria sukcesu (podsumowanie)

- `/admin/users` pokazuje tylko studentów.
- Brak cichego ucięcia przy 51+ kontach.
- Przy błędzie danych tabela się nie renderuje, a błąd jest jawny w UI.
