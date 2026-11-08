# Trade Ledger

A private trading journal: daily pre-market plan and post-session review, trade log with automatic P&L and R-multiples, performance stats, a P&L calendar, a setup playbook and a watchlist. Works on desktop and installs to a phone's home screen.

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

## Security

The publishable key in `config.js` is meant to be public. Each user can only read and write their own rows, enforced by row-level security in the database.
