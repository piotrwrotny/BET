# Mapa możliwości

## Kontekst

- **Projekt / kontekst**: BET (Business English Exam) oraz przyszłe projekty kursowe/zespołowe korzystające z agentów AI.
- **Ograniczenie danych**: Testowe / lokalne / tylko do odczytu / nieczułe.
- **Data**: 2026-07-01

## Mapa

| Sygnał | Istniejąca / domyślna odpowiedź | Cienkie uzupełnienie | Pierwsza użyteczna wersja | Ryzyko danych | Kierunek, jeśli wartościowy |
|---|---|---|---|---|---|
| Artefakty AI (reguły, skille, prompty) są kopiowane ręcznie między repo. | Każde repo trzyma własne `AGENTS.md`, `.cursorrules`, `CLAUDE.md` i skille; kopiowanie ręczne. | Jedno źródło prawdy dla artefaktów AI, z którego repo pobierają wersjonowane kopie. | Lokalny rejestr z 2–3 regułami/skillem; testowe repo konsumuje je przez npm/git-submodule/skrypt. | Testowe / lokalne / nieczułe | Narzędzie wewnętrzne — wspólny rejestr artefaktów AI |
| Codzienny status wymaga skakania po wielu narzędziach (GitHub, CI, release notes). | GitHub PRs, GitHub Actions, release notes, pliki w `context/`; każdy sprawdza osobno. | Poranny digest tylko do odczytu agregujący PR-y, joby CI, braki review i status release'u. | Skrypt lokalny czytający eksporty JSON/CSV lub mocki i generujący `digest.md`. | Testowe / lokalne / tylko do odczytu / nieczułe | Narzędzie wewnętrzne — praca asynchroniczna / digest zespołowy |

## Zalecany pierwszy kandydat

**Wspólny rejestr artefaktów AI**

- **Odczytuje**: pliki reguł (`AGENTS.md`, `.cursorrules`, `CLAUDE.md`), skille (`skill://...`) i prompty używane w projektach.
- **Zwraca**: wersjonowany zestaw artefaktów AI, które repo mogą importować zamiast kopiować ręcznie.
- **Nie robi**: nie zastępuje edytora/IDE, nie zarządza uprawnieniami użytkowników, nie wdraża się jako SaaS, nie wymaga produkcyjnej bazy danych.
- **Ryzyko danych**: testowe / lokalne / nieczułe — reguły i skille to publiczne lub wewnętrzne konwencje, nie dane klientów.
- **Kierunek, jeśli okaże się wartościowy**: narzędzie wewnętrzne — **wspólny rejestr artefaktów**.

## Dlaczego ten kandydat

- Widać już dwa osobne miejsca z regułami: `AGENTS.md` w repo i `CLAUDE.md` w profilu; przy większej liczbie projektów problem się nasili.
- Łączy dwie role: osobę piszącą reguły/skille oraz projekty je konsumujące.
- Pierwsza wersja mieści się na danych testowych i nie wymaga dostępu do produkcji ani uprawnień firmowych.
- Bezpośrednio pasuje do ścieżki **10xChampion → Shared AI Registry** (M5L4), więc ma gotowy przepływ dalszej pracy.

## Następny kierunek, jeśli wartościowy

Walidacja z użyciem `/10x-mom-test`, a następnie pełniejszy kształt przez `/10x-shape` → `/10x-prd` → `/10x-roadmap` lub proste wejście w budowę przez `/10x-new` → `/10x-research` → `/10x-plan` → `/10x-implement`, jeśli sygnał pozostanie wąski i jasny.
