---
project: "BET — English Learning Platform"
researched_at: 2026-05-24T10:00:00+02:00
recommended_platform: Vercel
runner_up: Cloudflare Workers
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 + React 19
  runtime: Node.js (Vercel Serverless Functions)
  database: Supabase (external, PostgreSQL + auth)
---

## Recommendation

**Deploy on Vercel (Pro plan, ~$20/month).**

Vercel scores 4.5/5 on agent-friendly criteria with a first-class Astro 6 adapter (`@astrojs/vercel` v10.0.7, `peerDep ^6.0.0`), a single-command rollback (`vercel rollback`), no CPU time limit on SSR functions, and automatic preview URLs for every PR without any CI configuration. The Pro plan was chosen because it eliminates cold starts, enables rollback to any previous deployment, and provides a comfortable $20/month budget the developer confirmed. The interview indicated no preference for cost vs. DX (Q2: neutral) and external providers are fine (Q5), making Vercel's Supabase Marketplace integration a bonus. Cloudflare Workers scored 5/5 on criteria but was de-prioritized due to the 10ms free-tier CPU trap (real for React 19 SSR), mandatory 2-step rollback, and Node.js API stubs that cause silent runtime failures not reproducible in local dev.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | **Total** |
|---|---|---|---|---|---|---|
| **Vercel** | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | ⚠️ Partial | **4.5 / 5** |
| **Cloudflare Workers** | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | **5 / 5** |
| **Railway** | ⚠️ Partial | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | **4 / 5** |
| **Netlify** | ⚠️ Partial | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | **4 / 5** |
| **Render** | ⚠️ Partial | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | **4 / 5** |
| **Fly.io** | ⚠️ Partial | ⚠️ Partial | ⚠️ Partial | ✅ Pass | ⚠️ Partial | **2.5 / 5** |

**Notes per platform:**

- **Vercel**: CLI covers deploy, logs, rollback. No CPU limit. Partial MCP because `mcp-handler` targets Next.js/Nuxt — Astro is manual, undocumented. `vercel mcp` CLI (GA) helps configure local tooling. Docs available at `vercel.com/llms.txt` + `vercel.com/docs/llms-full.txt`.
- **Cloudflare Workers**: Full 5/5 on criteria. 14 dedicated MCP servers (GA). Docs fetchable as Markdown via `Accept: text/markdown`. Eliminated from recommendation because: 10ms CPU free tier traps React 19 SSR; `@astrojs/cloudflare` v13.5.4 defaults to `prerenderEnvironment: 'workerd'` (breaking change for Node.js deps in prerendered pages); 2-step rollback (`wrangler versions list` + `wrangler versions deploy`); Auto Minify breaks React hydration (must disable manually).
- **Railway**: Good MCP (local + remote, GA). `railway up` is clean. Rollback is dashboard-only; image retention 72h on Hobby. No free tier for persistent SSR ($1 credit ≈ 2 days).
- **Netlify**: Official MCP (`@netlify/mcp`, GA). No CLI rollback — UI/API only. Free tier locked to us-east-2. Log retention 24h on free tier.
- **Render**: Free tier 60-second cold start spin-down makes it unsuitable for production MVP without Starter ($7/mo). No native object storage. Rollback CLI not available.
- **Fly.io**: Free tier discontinued for new customers (Oct 2024). Requires Dockerfile. No `llms.txt`. `fly mcp` is EXPERIMENTAL. Rollback requires `fly deploy --image` with manual version lookup.

### Shortlisted Platforms

#### 1. Vercel (Recommended)

First-class Astro 6 adapter (`@astrojs/vercel` v10.0.7, peerDep `^6.0.0`), no CPU time limits, automatic PR preview URLs, `vercel rollback` (1 command, any deployment on Pro), `vercel logs --follow` with filtering, `llms.txt` + `llms-full.txt`, Supabase Marketplace integration with env-var auto-injection. Pro plan ($20/mo) fits declared budget and eliminates cold starts and single-step rollback limitation. The main gap vs. Cloudflare is the MCP story (not Astro-native), but `vercel mcp` CLI and the `mcp-handler` package cover operational needs adequately.

#### 2. Cloudflare Workers

Highest raw score (5/5) with the richest MCP ecosystem (14 servers). Developer has existing comfort with the platform. Free tier is generous (100k req/day). However, for this specific project: the 10ms CPU trap on free tier (real for React 19 SSR), silent Node.js API stubs, mandatory Auto Minify fix, 2-step rollback, and `wrangler.jsonc` vs `wrangler.toml` tooling friction made it the runner-up after the anti-bias cross-check.

#### 3. Railway

Clean `railway up` deployment, `railway logs --follow` with powerful `--filter` flag, local + remote MCP (GA), `llms.txt` + `llms-full.txt`. Predictable $5/mo Hobby plan covers typical MVP compute. Loses to Vercel because: SSR requires manual `start` script configuration (Railpack only auto-detects Astro for static SPA), rollback is dashboard-only with 72h image retention, and developer has no prior familiarity.

## Anti-Bias Cross-Check: Vercel

### Devil's Advocate — Weaknesses

1. **Supabase region mismatch causes latency by default**: Vercel deploys functions to `iad1` (US East) by default. If Supabase project is in Europe, every SSR request adds ~100ms per DB roundtrip. Auth + content + progress = 3 queries = ~300ms hidden latency. Must explicitly configure `region` in the Vercel adapter config and align with Supabase region.
2. **Rollback doesn't revert DB migrations**: `vercel rollback` reverts application code but Supabase schema migrations are not rolled back. A deployment that includes a migration followed by a rollback leaves the DB schema ahead of the application — can cause runtime errors until schema is manually reverted.
3. **Edge runtime is disfavored by Vercel itself**: `middlewareMode: 'edge'` in `@astrojs/vercel` deploys Astro middleware to Vercel's Edge Runtime, which Vercel now recommends migrating away from ("improved performance and reliability"). Works today, but risks adapter breakage in future Vercel updates.
4. **`mcp-handler` does not support Astro natively**: The official Vercel MCP server framework targets Next.js and Nuxt. Deploying an MCP server from this Astro project on Vercel requires manual HTTP handler wiring — undocumented and unsupported.
5. **Preview deployments are public by default**: Every PR creates a public preview URL. For an auth-protected app this is low-risk, but competitors can access preview builds. Vercel Authentication for previews requires Pro (available with chosen plan).

### Pre-Mortem — How This Could Fail

The BET project launched on Vercel Pro in May 2026. By July, two separate incidents eroded student trust.

The first was a performance regression that stumped the developer for a week. Students reported slow lesson loading (600–900ms vs. expected 200ms). The root cause: Vercel defaults to `iad1` (US East), but the Supabase project was provisioned in `eu-central-1`. Every SSR page executed 2–3 Supabase roundtrips at ~100ms each. The fix required adding `region: 'fra1'` to the adapter config and redeploying — a non-obvious configuration option not surfaced in the Astro docs or Vercel onboarding.

The second incident came when a schema migration was followed by a rollback. An exercise-type refactor changed a column type. After discovering a bug, `vercel rollback` was issued — but Supabase kept the new schema. The application tried to read values from the old column shape, causing 500 errors on all exercise pages for 30 minutes. There was no rollback playbook for the DB migration layer.

Finally, the edge middleware path for auth — used because the Astro docs example showed `middlewareMode: 'edge'` — started emitting deprecation warnings in Vercel build logs after a platform update. Updating the adapter to drop edge middleware required refactoring the auth guard at an inconvenient moment.

### Unknown Unknowns

- **`@astrojs/vercel/serverless` is removed since v8.0.0**: Community tutorials, blog posts, and Stack Overflow answers still show `import vercel from '@astrojs/vercel/serverless'` — this throws a module-not-found error in Astro 6. The correct import is `import vercel from '@astrojs/vercel'`.
- **Fluid Compute bills CPU-time, not wall-clock**: Supabase query I/O wait is free; React 19 `renderToString` CPU is billed at $0.02/million ms. At 100k req/month with ~50ms average CPU per request, cost ≈ $0.10/month — negligible, but important to understand when debugging billing spikes.
- **Preview URLs are not rate-limited**: Every push to any branch creates a new deployment with a unique URL. In a busy feature branch workflow, hundreds of preview URLs can accumulate, each billed as a function invocation if accessed. Pro plan includes 1M function invocations — rarely an issue at MVP scale, but worth knowing.
- **Vercel caches build output aggressively**: If a dependency changes but `package.json` version is pinned (e.g., a force-pushed npm package), Vercel may serve a stale build from cache. Use `vercel --force` to bypass cache on suspect deployments.

## Operational Story

- **Preview deploys**: Every push to a non-production branch auto-creates a preview URL (`<hash>-<project>.vercel.app`). PRs get a stable preview URL commented automatically by Vercel's GitHub integration. Preview deployments require no extra CI setup. Preview URLs are public by default — for this auth-gated app acceptable, but note competitors can visit them.
- **Secrets**: Environment variables live in the Vercel project vault (Dashboard → Settings → Environment Variables). Pull to local dev with `vercel env pull .env.local` — this is the equivalent of Cloudflare's `.dev.vars`. Production secrets (Supabase URL, anon key) are set once via CLI: `vercel env add SUPABASE_URL production`. Supabase via Marketplace auto-injects credentials as env vars if provisioned through Vercel.
- **Rollback**: `vercel rollback` (Pro: rolls back to any previous deployment by URL or ID). Typical revert time: <30 seconds. **Caveat**: does not roll back Supabase schema migrations — maintain backward-compatible schema changes or document a manual DB rollback procedure.
- **Approval**: Destructive actions requiring human: rotating Supabase service role key, deleting Vercel project, upgrading billing plan, dropping a DB table. Agent may perform unattended: deploy, rollback application code, pull env vars, tail logs, create environment variables (non-secret), inspect deployments.
- **Logs**: `vercel logs --follow` streams live runtime logs. Filter by environment: `vercel logs --environment production`. Filter by HTTP status: `vercel logs --status-code 5xx`. Export as JSON: `vercel logs --json`. Log retention: 1 hour on Hobby; Vercel Log Drains (Pro) forwards to external storage for longer retention.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Supabase + Vercel region mismatch adds 100–300ms latency per page | Devil's advocate | H | H | Set `region: 'fra1'` (or matching Supabase region) in `@astrojs/vercel` adapter config before first deploy. Verify in Vercel dashboard: Settings → Functions → Region. |
| Rollback without DB migration rollback causes 500 errors | Devil's advocate | M | H | Use expand-contract migration pattern (additive-only changes per deploy). Document manual Supabase schema rollback steps in `docs/runbooks/rollback.md`. |
| Edge runtime deprecation breaks `middlewareMode: 'edge'` | Devil's advocate | L | M | Use Node.js runtime for middleware (default). Remove `middlewareMode: 'edge'` from adapter config if present; Astro middleware runs on Node.js functions by default. |
| Old `@astrojs/vercel/serverless` import breaks Astro 6 build | Unknown unknowns | M | M | Use `import vercel from '@astrojs/vercel'` (no subpath). Add lint rule or grep CI check for `/serverless` import. |
| Cold start on first request after Pro function warm-up timeout | Research finding | L | L | Pro plan includes cold start prevention — enable it per function in Vercel dashboard. Monitor with `vercel logs --status-code 5xx` for timeout-related 504s. |
| Preview URLs expose unreleased features to public | Unknown unknowns | L | L | Accept for auth-gated MVP. If needed: enable Vercel Authentication on preview branches (available on Pro). |
| Bundle size approaches 250 MB limit after adding rich-text or PDF libs | Research finding | L | M | Run `vercel build` locally and check `.vercel/output/` size before adding large dependencies. Keep heavy processing server-side; use Supabase Storage for file assets. |
| `vercel logs` retention is 1 hour on Pro (without Log Drains) | Research finding | M | L | Enable Vercel Log Drain (Pro feature) forwarding to Supabase or an external logging service (e.g., Axiom free tier). Set up before first production incident. |

## Getting Started

1. **Install Vercel CLI and log in:**
   ```bash
   npm install -g vercel
   vercel login
   ```

2. **Add the Astro Vercel adapter (Astro 6 compatible):**
   ```bash
   npx astro add vercel
   # Installs @astrojs/vercel@^10 (peerDep: astro ^6.0.0)
   ```
   Verify `astro.config.mjs` uses `import vercel from '@astrojs/vercel'` (no subpath).

3. **Configure region to match Supabase** — add to `astro.config.mjs`:
   ```ts
   import { defineConfig } from 'astro/config';
   import vercel from '@astrojs/vercel';
   export default defineConfig({
     output: 'server',
     adapter: vercel({
       maxDuration: 30,   // SSR + Supabase roundtrip budget
       isr: false,        // stateless SSR; no ISR caching needed
     }),
   });
   ```
   In Vercel Dashboard → Settings → Functions → Region: select the region closest to your Supabase project (e.g., `fra1` for Supabase `eu-central-1`).

4. **Set Supabase secrets and deploy:**
   ```bash
   vercel env add SUPABASE_URL production
   vercel env add SUPABASE_ANON_KEY production
   # Pull to local dev:
   vercel env pull .env.local
   # First production deploy:
   vercel --prod
   ```

5. **Link GitHub repository for automatic preview deploys:**
   In Vercel Dashboard → New Project → Import from GitHub. Subsequent pushes to `master` auto-deploy to production (configure in Git Integration settings). PRs get preview URLs automatically.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup beyond Vercel's built-in Git integration
- Production-scale architecture (multi-region, HA, DR)
