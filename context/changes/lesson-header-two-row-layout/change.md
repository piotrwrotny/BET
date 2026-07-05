---
project: BET
change_id: lesson-header-two-row-layout
title: Split lesson header navigation into two rows
status: completed
updated: 2026-07-05
created: 2026-07-05
---

# Split lesson header navigation into two rows

## Why

The lesson page header currently crams the Dashboard link, status badges, and prev/next navigation into a single horizontal row. On typical viewports this makes the navigation buttons hard to scan and can cause truncation/clipping. Splitting the header into two rows improves readability and creates clearer visual hierarchy.

## Scope

- Redesign the lesson page header (`src/pages/lessons/[id].astro`) into two rows.
- Preserve all existing functionality: Dashboard link, chapter breadcrumb, status badges, prev/next navigation.
- Keep the change purely presentational — no new data fetching or API changes.
- Maintain mobile-first, responsive layout using Tailwind CSS.
