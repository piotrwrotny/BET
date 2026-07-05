# Split lesson header into two rows — Krótki plan

> Pełny plan: `context/changes/lesson-header-two-row-layout/plan.md`
> Badania: `context/changes/lesson-header-two-row-layout/research.md`

## Co i dlaczego

Obecny nagłówek strony lekcji wciska Dashboard, status badges oraz nawigację prev/next w jeden poziomy pas. Poprawiamy hierarchię wizualną, dzieląc nagłówek na dwa rzędy: górny z metadanymi/statusami, dolny z nawigacją między lekcjami.

## Punkt wyjścia

- `src/pages/lessons/[id].astro` ma jeden rząd nagłówka z `flex justify-between`.
- Breadcrumb rozdziału renderuje się pod nagłówkiem, w głównej treści.
- Nawigacja prev/next jest zagnieżdżona po bokach jednego rzędu wraz z badge'ami.

## Pożądany stan końcowy

- Górny pas: `← Dashboard` (lewo), breadcrumb rozdziału + badges (prawo).
- Dolny pas: `← poprzednia lekcja` (lewo), `następna lekcja →` (prawo).
- Brak zmian funkcjonalnych; tylko układ wizualny.

## Kluczowe decyzje

| Decyzja | Wybór | Dlaczego | Źródło |
|---|---|---|---|
| Liczba rzędów | 2 (meta + nawigacja) | Czytelniejsza hierarchia, łatwiejsze skanowanie | Research |
| Breadcrumb | Przeniesiony do górnego pasa | Grupuje informacje o lokalizacji z statusami | Plan |
| Responsywność | Flex wrap na wąskich ekranach | Mobile-first bez dodawania breakpointów | Research |
| Technologia | Tailwind utility classes w `.astro` | Zgodne z konwencją projektu (brak React island) | Research |

## Zakres

**W zakresie:**
- Restrukturyzacja markupu nagłówka w `src/pages/lessons/[id].astro`.
- Przeniesienie breadcrumbu rozdziału z głównej treści do górnego pasa.
- Drobne dostrojenie spacingu i alignowania.

**Poza zakresem:**
- Nowe komponenty, nowe endpointy, nowe dane.
- Zmiany w logice nawigacji (prev/next computation).
- Zmiany w `LessonInteractive` ani innych komponentach.

## Architektura / Podejście

```
<header>                      flex flex-col gap-3
  <div>                       flex justify-between (meta row)
    <Dashboard link />
    <div>breadcrumb + badges</div>
  </div>
  <div>                       flex justify-between (nav row)
    <prev link />
    <next link />
  </div>
</header>
```

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
|---|---|---|
| 1. Refactor header markup | Dwurzędowy nagłówek z zachowanymi elementami | Przypadkowe ukrycie elementów przy wrapowaniu |
| 2. Weryfikacja | Zielone lint/typecheck + wizualna kontrola | Regresja wyglądu na mobile |

**Wymagania wstępne:** Brak — zmiana czysto prezentacyjna na aktualnym `dev`.  
**Szacowany wysiłek:** 1 krótka sesja, 2 fazy.

## Kryteria sukcesu (podsumowanie)

- `npm run lint` i `npm run typecheck` przechodzą.
- Strona lekcji renderuje dwa rzędy nagłówka zgodnie z projektem.
- Nawigacja prev/next oraz status badges pozostają widoczne i klikalne.
