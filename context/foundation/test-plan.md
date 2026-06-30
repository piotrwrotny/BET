# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-30

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the
   team is worried about X, and the failure would surface somewhere in
   <area>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/components`, `src/pages`, `src/lib`.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario)                  | Impact | Likelihood | Source (evidence — not anchor)                                          |
|---|------------------------------------------|--------|------------|--------------------------------------------------------------------------|
| 1 | Exercise verification accepts a wrong answer or rejects a correct variant | High | High | PRD FR-024; interview Q1; interview Q2 |
| 2 | Key / payload schema refactor silently breaks multi-variant matching | High | Medium | Interview Q2; hot-spot `src/pages/api/admin/exercises` (8 commits/30d) |
| 3 | New exercise-type wiring fails between admin form and student component | Medium | Medium | Interview Q3; hot-spot `src/components/lesson` (14 commits/30d) |
| 4 | Student accesses another student's data or hits admin endpoints | High | Low | PRD Access Control; interview Q4 |
| 5 | Answer normalization produces false positives or false negatives | Medium | Medium | PRD FR-024; interview Q1 |
| 6 | Completion gating wrongly requires open-ended exercise or ignores a missing closed exercise | High | Low | PRD FR-015; PRD Business Logic |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | Wrong answers are rejected; correct variants are accepted | "E2E covers it" — E2E is expensive and slow for this | Input/output contract of verification; how variants are stored and matched | Unit / contract test | Testing only happy path; copying expected answers from implementation |
| #2 | Adding/removing a key variant changes accepted answers as documented | Assuming a schema change is covered by type check alone | Schema shape for each exercise type; where keys are read at verification time | Unit / contract test | Mocking the exact function under test |
| #3 | New exercise type renders, submits, and reports correctly end-to-end | That admin form + API + student component stay in sync by convention | Data flow from admin save through API to student render | Component test + focused E2E | CSS selectors; testing every UI label |
| #4 | Non-owner / non-admin requests return 401/403 or correctly filtered data | "Logged in = authorized" | Session/role shape; which endpoints touch which resources | API contract / integration test | E2E-only coverage of a single happy path |
| #5 | Edge-case strings (case, whitespace, punctuation) are handled consistently | Human visual check is enough | Normalization rules for each exercise type | Unit table test | Expectations copied from current output |
| #6 | Lesson completes only after "mark read" plus all closed exercises correct | Open-ended exercise or no exercise still marks complete | State machine for lesson completion; which exercise types count as closed | Integration test | Testing only one exercise type |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name                | Goal (one line)                                  | Risks covered | Test types              | Status        | Change folder                                       |
|---|---------------------------|--------------------------------------------------|----------------|-------------------------|---------------|-----------------------------------------------------|
| 1 | Bootstrap unit/contract runner | Lock correctness of exercise verification     | #1, #2, #5     | unit + contract         | not started   | —                                                   |
| 2 | Admin/student access boundary tests | Lock role and ownership checks            | #4, #6         | API contract / integration | not started | —                                               |
| 3 | Exercise-type wiring + completion tests | Lock admin→student flow per exercise type | #3, #6         | component + focused e2e | not started   | —                                                   |
| 4 | Quality-gates wiring      | Block regressions in CI                          | cross-cutting  | CI gates                | not started   | —                                                   |

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.
Recommendations in this section must be grounded in local manifests/configs
plus the MCP/tools actually exposed in the current session. If a useful docs
or search MCP such as Context7 or Exa.ai is not available, say that instead
of assuming access.

| Layer                | Tool                       | Version | Notes                                |
|----------------------|----------------------------|---------|--------------------------------------|
| unit + integration   | none yet                   | —       | see §3 Phase 1                       |
| API mocking          | none yet                   | —       | see §3 Phase 2                       |
| e2e                  | Playwright                 | —       | 6 specs in `tests/e2e/` today        |
| accessibility        | none yet                   | —       | not a current priority               |
| AI-native            | none                       | —       | not used; deterministic tests preferred |

**Stack grounding tools (current session):**
- Docs: Context7 + framework docs MCP — checked Playwright/Astro docs availability; checked: 2026-06-30
- Search: built-in `web_search` (Exa.ai not available in this session); checked: 2026-06-30
- Runtime/browser: Playwright MCP + browser tool — available for e2e layers; checked: 2026-06-30
- Provider/platform: none used for test planning; checked: 2026-06-30

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required for §3 Phase <N>" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate                          | Where             | Required?                   | Catches                                       |
|-------------------------------|-------------------|------------------------------|-----------------------------------------------|
| lint + typecheck              | local + CI        | required                     | syntactic / type drift                        |
| unit + integration            | local + CI        | required after §3 Phase 1    | logic regressions                             |
| e2e on critical flows         | CI on PR          | required after §3 Phase 1    | broken critical user paths                    |
| post-edit hook                | local (agent loop) | planned                     | regressions at edit time                      |
| visual diff (deterministic)   | CI on PR          | optional                     | rendering regressions                         |
| multimodal visual review      | CI on PR          | optional                     | visual issues classic diff misses             |
| pre-prod smoke                | between merge + prod | optional                  | environment-specific failures                 |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase <N>."

### 6.1 Adding a unit test

TBD — see §3 Phase 1.

### 6.2 Adding an integration / API contract test

TBD — see §3 Phase 2.

### 6.3 Adding an e2e test

TBD — see §3 Phase 3.

### 6.4 Adding a test for a new exercise type

TBD — see §3 Phase 3.

### 6.5 Adding a test for a new admin endpoint

TBD — see §3 Phase 2.

### 6.6 Per-rollout-phase notes

TBD — phases not yet started.

## 7. What We Deliberately Don't Test

No explicit exclusions were raised during the Phase 2 interview (Q5 was skipped).
All functional areas listed in the risk map are considered testable. Re-evaluate
this section in the next `--refresh` if budget or scope constraints appear.

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-30
- Stack versions last verified: 2026-06-30
- AI-native tool references last verified: 2026-06-30

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
