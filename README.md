# Trade Ledger

A private trading journal for live, demo and prop firm accounts. Works on desktop and installs to a phone's home screen.

- **Dashboard:** every stat the data supports (P&L, win rate, profit factor, expectancy, drawdown, streaks, Sharpe, consistency), equity and drawdown chart, breakdowns by setup, symbol, session, hour, trade number, grade, emotion, plan and source, plus plain-language insights.
- **Accounts:** multiple accounts (live, demo, prop challenge phases, funded), deposits/withdrawals/payouts, per-account risk and guardrails (daily and weekly loss limits, consecutive stop-losses, max trades).
- **Prop firms:** presets for popular firms (`prop-firms.json`, with sources and check dates), live progress to target, drawdown room, trading days and consistency.
- **Risk:** position size calculator, multiple targets with blended R:R, minimum R:R warnings, oversize detection.
- **Today:** pre-market plan, no-trade days, rules checklist, post-session review, watchlist.
- **Statement:** weekly and monthly account statement, export to Excel or print to PDF.
- **Import:** MT4/MT5 history reports and CSV, with duplicate detection.
- **Feedback:** in-app reviews and change requests (stored in the `feedback` table).
- **Updates:** open apps show a "new version ready" banner after each push.

Static site (HTML, CSS, vanilla JS) hosted on GitHub Pages. Login and data are handled by Supabase.

## Setup

1. Create a Supabase project and run `schema.sql` in its SQL editor.
2. In Supabase, go to **Authentication → URL Configuration** and set the Site URL to `https://journal.techxserve.com`.
3. Put the project URL and publishable (anon) key in `config.js`.
4. Open the site, choose **Create account**, and confirm your email.
5. Lock it down: set `allowSignup: false` in `config.js`, and in Supabase turn off **Authentication → Sign In / Providers → Allow new users to sign up**.

## Custom domain

The `CNAME` file points GitHub Pages at `journal.techxserve.com`. At your DNS provider, add:

| Type  | Name    | Value                  |
|-------|---------|------------------------|
| CNAME | journal | shayyan-007.github.io  |

Then enable **Enforce HTTPS** in the repo's Settings → Pages.

## On your phone

Open the site in Safari (iPhone) or Chrome (Android), then **Share → Add to Home Screen**. It opens full-screen like an app.

## Releasing

`.githooks/pre-commit` stamps `version.json` on every commit; enable it once per clone with `git config core.hooksPath .githooks`. Open apps poll `version.json` and offer a refresh when it changes.

## Reading feedback

Feedback and firm requests are visible in the Supabase dashboard (Table editor → `feedback`, `firm_requests`). Set `status` and `reply` there and the user sees them on their Feedback screen.

## Security

The publishable key in `config.js` is meant to be public. Each user can only read and write their own rows, enforced by row-level security in the database.
