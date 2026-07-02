# CI / CD i decyzje wdrożeniowe — BET

## Status

Aplikacja ma w pełni zautomatyzowany **pipeline CI** uruchamiany na każdym pushu/PR do `master` i `dev` (oraz branchy modułowych).

## Pipeline CI

Plik: `.github/workflows/ci.yml`

### Job `quality` (wymagany)

Kolejność bramek:

1. `npx astro sync` — generuje typy Astro (wymagane przed typecheckiem).
2. `npm run lint` — ESLint z regułami type-check.
3. `npm run typecheck` — `astro check`.
4. `npm run test` — 75 testów jednostkowych Vitest.
5. `npm run build` — produkcyjny build Astro + Cloudflare adapter.

Każdy krok jest wymagany. Pipeline anuluje wcześniejsze uruchomienia dla tej samej gałęzi dzięki `concurrency.cancel-in-progress`.

### Job `e2e` (opcjonalny, `continue-on-error: true`)

Próbuje uruchomić lokalny stos Supabase i testy Playwright. Darmowe runnery GitHub Actions oraz konieczność Dockera sprawiają, że ten job jest traktowany jako **dodatkowa informacja**, nie blocker PR.

## Sekrety

Workflow wymaga trzech sekretów repozytorium:

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Są one przekazywane tylko do kroków, które ich wymagają (`astro sync`, `typecheck`, `build`, e2e).

## Decyzja o wdrożeniu

BET jest **customowym projektem kursowym** (nie wersją 10xCards). Zgodnie z kryteriami certyfikacji 10xDevs 3.0 dla projektu customowego **publiczny URL nie jest wymagany** — wystarczy spełnienie wymagań obowiązkowych oraz dokumentacja procesu (pliki kontekstowe, testy, CI/CD).

Wybraliśmy **nie wdrażać aplikacji na Cloudflare Pages** w ramach certyfikacji, ponieważ:

1. MVP został zbudowany na Cloudflare Workers adapterze, ale wybór ten był świadomie zaparkowany jako ryzykowny dla React 19 SSR (zob. `context/foundation/infrastructure.md`, sekcja „Zaparkowane").
2. Decyzja o migracji na Vercel została odłożona po MVP; przeprowadzenie jej tuż przed terminem certyfikacji wprowadziłoby zbędne ryzyko.
3. Obecność działającego CI, publicznego repo, dokumentacji architektury oraz testów stanowi wystarczający dowód procesu dla projektu customowego.

Pipeline CI potwierdza, że aplikacja **buduje się poprawnie** w czystym środowisku, co jest równoważne gwarancji, że jest gotowa do wdrożenia po dodaniu odpowiednich sekretów i kroku deploy.
