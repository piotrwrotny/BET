# Requirements: ci-cd-code-review

## Overall concept

- GitHub Actions workflow runs for every new pull request to `master` and `dev`.
- The review logic lives in a reusable composite action so the main workflow is
  small and easy to reason about.
- The pipeline is human-in-the-loop: it posts a review comment and labels the
  PR, but does not auto-block merges.

## Input parameters

- Pull request title (`github.event.pull_request.title`)
- Pull request description (`github.event.pull_request.body`)
- Git diff between the PR branch and the base branch (`git diff origin/<base>...HEAD`)
- LLM API key passed as a secret

## Code review criteria

Each criterion is scored on a 1–10 scale, where 1 is the worst outcome and 10
is the best.

| Criterion | 1 (bad) | 10 (good) |
|---|---|---|
| `implementationCorrectness` | Change does not implement the stated intent or introduces regressions. | Change correctly implements the intent with no regressions. |
| `idiomaticity` | Code fights the framework / language conventions. | Code follows project conventions and idiomatic patterns. |
| `complexity` | Unnecessarily complex, hard to follow, over-engineered. | As simple as the problem allows, easy to reason about. |
| `testRiskCoverage` | No tests where risk exists, or tests do not cover changed behavior. | Risks introduced by the change are covered by tests. |
| `documentation` | Public API / behavior changes lack docs or comments. | Changes are sufficiently documented for the next maintainer. |
| `securitySafety` | Introduces vulnerabilities or unsafe patterns. | No new security risks, unsafe code is justified and guarded. |

Output shape is enforced by a Zod schema: scores per criterion, an overall
`verdict` (`pass` / `fail`), and a human-readable `summary`.

## Parked for later

- `businessAlignment` (requires product context beyond the diff).
- `architecturalFit` (requires broader codebase / plan context).
- Plan-based review (read plan from `context/changes/<id>/plan.md`).
- Triage step that skips trivial PRs or escalates risky ones.
- Cost / token telemetry dashboard.

## Expected side-effects

- PR comment with a short summary and per-criterion scores.
- Labels: `ai-cr:failed` (red) OR `ai-cr:passed` (green).
- Optional: `ai-cr:review` label triggers a re-run (future enhancement).

## Expected behavior

- On PR open / synchronize / reopened the workflow runs automatically.
- On `workflow_dispatch` the workflow can be triggered manually for testing.
- If the LLM call fails or returns invalid JSON, the action fails loudly
  instead of silently passing.
