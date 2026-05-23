---
starter_id: 10x-astro-starter
package_manager: npm
project_name: bet
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
---

## Why this stack

Solo developer building BET (Business English Tests), a content-heavy web app with two roles (Admin, Student), deterministic exercise verification, and a 5-week after-hours deadline. The 10x Astro Starter ships Astro 6 + React 19 + TypeScript + Supabase (PostgreSQL + auth) + Cloudflare Pages out of the box — covering the three load-bearing needs: structured content (blog-style lessons), authentication (email + password, two roles), and a fast, low-ops edge deployment. All four agent-friendly gates pass. Bootstrapper confidence is first-class (registered CLI, expected to work). CI runs on GitHub Actions with auto-deploy on merge to main, matching the starter's default shape. Payments, realtime, AI, and background jobs are all out of scope per PRD non-goals.
