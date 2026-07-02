# Supabase Keep-Alive via Vercel Cron — Design

**Date:** 2026-07-02
**Status:** Approved
**Author:** rayfaiq (with Claude Code)

## Problem

Celengan's Supabase project runs on the free tier, which **pauses after ~7 days of
inactivity**. When paused, every database query hangs, the Telegram webhook
(`/api/telegram`) times out, and the bot goes silent with no reply — exactly the
outage observed on 2026-07-02.

A keep-alive already existed: `.github/workflows/keep-supabase-alive.yml`, a GitHub
Actions cron pinging Supabase every 5 days. It failed because **GitHub automatically
disables scheduled workflows after 60 days of no repository activity**. The last
commit was 2026-04-19 (~74 days before the outage), so GitHub silently disabled the
cron around mid-June, the pings stopped, and Supabase idled into a pause.

The core lesson: the keep-alive must live somewhere that stays running even when the
repo is dormant — because a dormant repo is precisely when a "finished" project needs
it most.

## Goal

Guarantee the Supabase project never idles past 7 days, using a mechanism that:
- does **not** self-disable on repo inactivity,
- is **version-controlled** in the repo,
- costs nothing (stays on Supabase + Vercel free tiers),
- surfaces failures instead of dying silently.

## Approach

Use **Vercel Cron**. The app is already deployed and always-on at Vercel; a Vercel
cron runs as long as the production deployment exists and is not affected by repo
inactivity. Rejected alternatives:

- **External monitor (cron-job.org / UptimeRobot):** works, but lives in an external
  dashboard — not version-controlled, easy to forget, another account to manage.
- **Fix the GitHub Action:** re-enabling it only defers the same 60-day auto-disable
  failure. Not robust for a dormant project.

## Components

Three changes:

1. **New route — `app/api/cron/keep-alive/route.ts`**
   - `GET` handler (Vercel Cron issues GET requests).
   - Runs one lightweight query via the existing `createServiceClient()`:
     `from('settings').select('id').limit(1)`. This is a real PostgREST call to the
     Supabase project, which counts as activity and resets the inactivity timer.
   - `export const dynamic = 'force-dynamic'` so the route is never statically cached
     — a cached response would skip the DB hit and silently recreate the bug.
   - Returns `{ ok: true }` (HTTP 200) on success.

2. **New file — `vercel.json`**
   ```json
   { "crons": [{ "path": "/api/cron/keep-alive", "schedule": "0 6 * * *" }] }
   ```
   Daily at 06:00 UTC (13:00 WIB).

3. **Delete — `.github/workflows/keep-supabase-alive.yml`**
   Removes the dead mechanism so there is a single source of truth.

## Schedule

Daily (`0 6 * * *`). Daily gives a 7× safety margin against the 7-day pause and is
compatible with Vercel's Hobby plan (one cron run per day). A missed day is
harmless — still far below the limit.

## Auth

Vercel automatically attaches `Authorization: Bearer $CRON_SECRET` to cron requests
when a `CRON_SECRET` env var is set on the project. The route enforces the check
**only if `CRON_SECRET` is present**, so:
- it works immediately after deploy (before the secret is added), and
- it becomes locked down the moment the secret is set.

Worst case if left open: a stranger can trigger a harmless `SELECT id LIMIT 1`.

**Manual step (user):** add a `CRON_SECRET` env var in Vercel (any random string) to
engage the auth check.

## Error handling

If the query returns an error, log it and return **HTTP 500** so the run appears as
**Failed** in Vercel → Cron Jobs. This gives visibility — the opposite of the silent
death that caused the original outage. Success returns 200.

## Testing / Verification

No automated test suite exists (manual testing per project convention). Verify by:

1. After deploy, `curl` the live endpoint and confirm HTTP 200 + `{ ok: true }`
   (proves the route runs and the DB query succeeds).
2. Confirm the cron appears under **Vercel → Settings → Cron Jobs**.
3. (Optional) Trigger the cron manually from the Vercel dashboard and confirm a
   successful run in the logs.

## Out of scope

- Upgrading Supabase to Pro (removes pausing entirely, but costs ~$25/mo).
- Broader health monitoring / alerting.
