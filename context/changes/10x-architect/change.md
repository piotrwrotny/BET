---
title: 10xArchitect Certification Block
status: in-progress
branch: module-4-architect
created: 2026-07-02
---

# 10xArchitect — BET

Goal: produce the Module 4 Lesson 5 architecture artifacts required for the 10xArchitect certification block:

1. `context/domain/01-domain-distillation.md` — DDD domain map and ubiquitous language.
2. `context/domain/02-invariant-aggregate-refactor.md` — invariant diagnosis and aggregate refactor plan.
3. `context/domain/03-anti-corruption-layer.md` — ACL design for the worst leaky dependency.

All three documents follow the local M4L5 prompts in `.omp/prompts/` and contain concrete file:line citations from the BET codebase.

## Deliverables

- [x] `context/domain/01-domain-distillation.md`
- [x] `context/domain/02-invariant-aggregate-refactor.md`
- [x] `context/domain/03-anti-corruption-layer.md`
- [x] Server-side reading confirmation implemented (`lesson_reading_confirmations`,
      `StudentLessonProgress`, `POST /api/lessons/[id]/read`, updated completion flow)
- [x] Old `LessonCompletion` aggregate removed
- [x] Build / test / lint / typecheck passing on `module-4-architect`
- [x] `.github/workflows/ci.yml` with lint / typecheck / unit tests / build gates
- [x] `context/foundation/ci.md` documenting pipeline and deployment decision
- [x] Branch pushed to origin
