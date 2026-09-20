# ষোলো সমবায় সমিতি — ব্যবস্থাপনা ওয়েবসাইট

Management website for the cooperative society **ষোলো সমবায় সমিতি**: members, monthly dues (চাঁদা),
late fines, an income/expense ledger, member-submitted payment proofs with an admin review queue,
and an admin dashboard. The interface is in Bengali; the code and comments are in English.

Stack: Next.js 16 (App Router) · TypeScript · PostgreSQL 16 · Prisma 7 · Tailwind v4 · Cloudinary.

---

## Getting started

```bash
cp .env.example .env     # then fill in the values (see below)
pnpm install
pnpm db:up               # Postgres 16 via Docker, on host port 5434
pnpm db:deploy           # apply migrations
pnpm db:seed             # admin + 28 placeholder members + due settings
pnpm dev                 # http://localhost:3002
```

Ports 5432 and 3000 are occupied by unrelated services on the original development machine, which is
why this project uses **5434** for Postgres and **3002** for the dev server. Both are single values in
`docker-compose.yml` and `package.json` if you want to change them.

### Environment

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `DIRECT_DATABASE_URL` | Used by migrations; identical unless a pooler sits in front |
| `SESSION_SECRET` | ≥32 chars. `openssl rand -base64 48` |
| `ADMIN_EMAIL` / `ADMIN_NAME` / `ADMIN_PASSWORD` | Used once by the seed; password must be ≥12 chars |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Server-side only |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Safe to expose |
| `CRON_SECRET` | Bearer token for the rollover endpoint. `openssl rand -hex 32` |

`.env` is gitignored and **this repository is public** — never commit it. The Cloudinary API secret is
used only to sign uploads server-side and never reaches the browser.

---

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server on :3002 |
| `pnpm build` / `pnpm start` | Production build and serve |
| `pnpm test` | Unit tests (pure logic, no database) |
| `pnpm test:tz` | The unit suite under UTC, Asia/Dhaka, America/New_York and Pacific/Kiritimati |
| `pnpm test:component` | React component tests for the public form (jsdom) |
| `pnpm test:integration` | Integration tests against a real Postgres (`somiti_test`) |
| `pnpm test:all` | All three suites |
| `pnpm db:up` / `db:down` | Start / stop the Docker database |
| `pnpm db:migrate` / `db:deploy` | Create / apply migrations |
| `pnpm db:seed` | Seed admin, members, due settings, expense heads |
| `pnpm db:verify` | Assert the hand-written constraints still exist |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript |

Before integration tests, create the test database once:

```bash
docker exec somiti-postgres psql -U somiti -d postgres -c "CREATE DATABASE somiti_test OWNER somiti;"
```

---

## The public side

Anyone can read these without logging in:

| Route | Contents |
|---|---|
| `/` | The society's fund balance, income and expense totals, and this month's collection progress |
| `/accounts` | Income by source, expenses by head, month-by-month totals, and the recent ledger |
| `/members` | The member directory with each member's total contribution |
| `/members/[code]` | One member's month-by-month history |
| `/pay/submit` | The payment-proof form |

Two things are deliberately withheld from every public page, and
`tests/integration/public-pages.test.ts` fails if either ever leaks:

1. **Contact details** — `mobile`, `email` and `fatherName`. A public roster of
   names against phone numbers is an invitation to targeted fraud.
2. **Payment references** — approval notes embed the member's bKash or bank
   reference (e.g. `… — TXN9988`). The public ledger describes income rows from
   their category instead of echoing the stored note. Admin-written *expense*
   notes are shown, since describing what the money was spent on is the point.

`src/app/robots.ts` keeps `/` and `/accounts` indexable but excludes `/members`,
so a member's name and finances will not surface in a web search for that person.
The pages stay readable by anyone with the link. Remove those rules if the
society decides it wants them indexed.

## Society bank details

The account members send dues to lives in `src/lib/society.ts` — one constant, so
the account number appears in exactly one place in the codebase. It is rendered
by `BankDetails` on the home page and above the payment form.

Account number, routing number and SWIFT code are marked `verbatim`: they render
in **Latin digits** with `select-all` and a copy button, and never pass through
`toBnDigits`. A member retypes these into a banking app, so showing
`২০৭৭৪৭২৬৩০০০১` instead of `2077472630001` would invite a mistyped transfer.
`tests/component/bank-details.test.tsx` fails if a Bengali numeral ever appears
in that card.

Note that the account is visible to anyone on the internet, not only to members,
since the site is public. That is normal for a society collecting dues, but it is
a deliberate consequence of the public pages rather than an oversight.

## Light and dark themes

A toggle sits in the public navbar, the admin header, and on the login page
(which is outside both shells).

The light theme is unchanged. Dark is defined by restating the semantic tokens
under `:root[data-theme='dark']` in `globals.css` — every component built on
`bg-surface`, `text-ink`, `border-line` and friends follows without being
touched. Only the accent tiles, status chips, toasts and a handful of tinted
panels needed explicit `dark:` variants, because those use Tailwind's palette
directly and cannot be retinted from one place.

Greens brighten rather than darken in the dark theme: the light theme's
emerald-700 is legible on white and invisible on near-black.

Three details that matter more than they look:

- **No flash of the wrong theme.** The choice lives in `localStorage`, which the
  server cannot read, so an inline script in `<head>` applies it before first
  paint. Doing this in an effect would show every returning member a flash of
  light on every page load. `THEME_INIT_SCRIPT` lives in `src/lib/theme.ts` and
  `tests/unit/theme.test.ts` executes that exact string, so it cannot drift.
- **The toggle renders both icons** and lets CSS pick. Choosing in JavaScript
  would mean the server renders one and the browser another — a hydration
  mismatch on every load. The `aria-label` is constant for the same reason.
- **`color-scheme` is set on `<html>`**, so native scrollbars, form controls and
  the date picker's own chrome follow the theme. Nothing in our CSS can reach
  those.

The site **opens dark**. That is a decision rather than a reading of the system
preference (`DEFAULT_THEME` in `src/lib/theme.ts`); once someone picks for
themselves, their choice is kept instead.

Every accent tone must restate its own colours for dark, because those use
Tailwind's palette directly. `tests/component/stat-tile.test.tsx` walks every
tone and fails if one has no `dark:` variant — one shipped without it because a
find-and-replace missed a differing opacity suffix, leaving a white panel with
dark text on a dark page.

## Pagination

Every listing shows **10 rows per page** (`PAGE_SIZE` in `src/lib/paginate.ts`).

Paging is server-side: each control is a real `<Link>`, so it works without
JavaScript and every page is bookmarkable. Existing query parameters are carried
through, so a filter survives paging (`?status=all&page=3`). An out-of-range or
malformed `?page=` clamps to a valid page rather than rendering an empty table.

Two details worth knowing:

- **Totals are not per-page.** The dues page, the ledger and the member cards
  aggregate across the whole result set in SQL, so the figure above a table never
  changes as you page through it.
- **The public ledger pages in SQL**, not by slicing a capped result. A society
  of 28 members writes roughly 350 ledger rows a year, so any fixed cap would
  quietly start hiding history.

The `/accounts` page carries two independent pagers (`?mpage=` for monthly
totals, `?lpage=` for the ledger).

## The rules that matter

### The 21st→20th due cycle

Month **M**'s due is collectible from **21 (M-1) 00:00:00** to **20 M 23:59:59**, Asia/Dhaka.
Missing that deadline adds a **flat, one-time ৳200** fine — never daily, never compounding.

All of this lives in `src/lib/due-cycle.ts` and `src/lib/fines.ts`, which are pure and have no
dependencies. They do not pass `Date` objects around: a `Date` is an instant, and asking one what
calendar day it is gives a different answer per timezone, which would misfine members. Instead the
domain uses `CivilDate` — a calendar day in Dhaka — and converts at the two boundaries (HTTP input and
database I/O) using `getUTC*`/`Date.UTC` only. Bangladesh is UTC+6 with no DST, so a fixed offset is
exact.

An ESLint rule bans local-time `Date` getters everywhere except `due-cycle.ts`, and `pnpm test:tz`
runs the suite under four timezones bracketing Dhaka, so an off-by-one cannot pass unnoticed.

### A month cannot be paid before it is priced

Until an admin sets the subscription for a month, that month is not selectable
on the payment form and the API refuses a submission for it. Quoting ৳0 would
file the money as surplus instead of a subscription, which is a mess to unpick
later.

The rule is **per month**, not per form: if the current month has no price but
an earlier one is still owed, the member can still pay the arrears. The page
says plainly when the current month is not open yet.

A month already billed on the member's own row counts as priced, even if the
setting was removed since — they owe what they were billed.

### Arrears, and what one payment settles

A member who misses a deadline owes that month's subscription, a ৳200 fine, and
then the next month's subscription too — and they send the lot in one transfer
with one transaction reference. So a payment is not tied to a single month.

Missing several months in a row means **a fine per month**: three missed months
is three × ৳200, not one fine that grew.

`src/lib/settlement.ts` spreads a payment across every month it can cover,
oldest first, and within a month the subscription before its fine. That ordering
matters — a member who is slightly short should end up having paid their
subscription and still owing the fine, not the reverse.

It is pure, and both callers use it: the payment form quotes with it and the
approval settles with it, so what a member is told they owe and what the ledger
records come from the same arithmetic. The review screen previews the same plan,
so an admin can see which months a payment clears before approving it.

A month counts as paid once its subscription is covered; an unpaid fine stays
outstanding against it without holding the month open. A month that receives
nothing stays open rather than looking settled.

`DuePayment.sourceSubmissionId` is deliberately **not** unique: one proof now
backs several rows.

### On-time vs late is judged by the sending date

Never by the review date — a slow admin review must not cost a member ৳200.

### One active submission per member per due month

Enforced in three places:

1. **Database** — a *partial* unique index on `(member_id, due_year, due_month) WHERE status IN
   ('PENDING','APPROVED')`. `REJECTED` rows are excluded, so a member can resubmit after a rejection.
   This is the only layer that survives two simultaneous requests.
2. **API** — a pre-check returning a clear Bengali message, which also maps the database's `23505`
   to the same 409 if it loses the race.
3. **Form** — the lookup endpoint reports an existing submission on ID blur, so the member is warned
   before filling anything else in.

> ⚠️ **Never run `prisma db push` in this repository.** It diffs the schema against the database and
> silently drops the partial index and every CHECK constraint, downgrading this rule to
> application-only enforcement with no visible error. Use `prisma migrate`. `pnpm db:verify` asserts
> the constraints are present — run it in CI.

### The submission form

The ID number is a dropdown of the society's active members, and picking one
fills the name from the member record. The name field is **read-only**: a payment
proof should always be filed under the registered name, and letting it be typed
over would let one member's payment be recorded against another's name. (The
original specification called for an editable name; this is a deliberate change.)

### Paying an earlier month

The specification derives the due month from the sending date *and* asks for a `PAID_LATE` status
based on that same date — which cannot both hold, because a derived due month always contains its own
sending date. The public form therefore carries a **কোন মাসের চাঁদা** selector, defaulting to the
derived month and additionally offering any earlier month the member still owes. Paying April's due on
3 May then correctly records `PAID_LATE` plus the ৳200 fine.

### Money

Every amount is an integer number of **paisa** in a column suffixed `_paisa`. Never a float (which
cannot represent 0.1) and never Prisma `Decimal` (which does not serialise cleanly from a Server
Component into a Client Component). Taka exists only in `toPaisa()` and `formatBDT()`.

### Fines charged vs fines collected

`DuePayment.finePaisa` is what was **charged**; `finePaidPaisa` and the FINE ledger rows are what was
**collected**. The rollover job deliberately writes no FINE transaction when it levies a fine — a
levied fine is a receivable, and booking it as income would overstate the dashboard. The FINE row is
written when the money actually arrives.

---

## The month-rollover job

`POST /api/cron/month-rollover` closes each month whose deadline has passed and opens the next one.
It is guarded by `CRON_SECRET` (compared in constant time) and also accepts a logged-in admin, so the
dashboard's **"মাস শেষের কাজ চালান"** button runs the identical code.

On a VPS, add to the crontab:

```cron
TZ=Asia/Dhaka
5 0 21 * * curl -fsS -X POST -H "Authorization: Bearer YOUR_CRON_SECRET" \
  http://127.0.0.1:3002/api/cron/month-rollover >> /var/log/somiti-cron.log 2>&1
```

Running it twice is a no-op. Four independent mechanisms guarantee that, any one of which would
suffice on its own:

1. the `JobRun` unique `(job, period_key)`, taken as the first statement inside the transaction;
2. the `status = 'PENDING'` predicate on the fine update — a second pass matches zero rows;
3. the unique `(member_id, year, month)` on `DuePayment` with `ON CONFLICT DO NOTHING`;
4. `Transaction.idempotencyKey`.

If a run is missed, the next one heals the gap (up to 12 months). On a **first** run there is no
history to heal, so only the month that just closed is processed — sweeping backwards from a cold
start would invent due rows for months the society never collected.

---

## Layout

```
prisma/           schema, migrations (incl. the hand-written constraints), seed
scripts/          verify-db-constraints.ts
src/lib/          due-cycle · fines · money · member-code   ← pure, fully tested
src/lib/services/ members · dues · submissions · transactions · import · rollover
src/lib/api/      route wrapper, error mapping, rate limiting
src/app/admin/    the nine admin screens
src/app/pay/      the public submission form
tests/unit/       date, fine, money and code logic (no database)
tests/integration/ the rules that only the database can enforce
```

---

## Still open with the client

- **Member codes** — the year digits follow the joining year while the sequence counts continuously,
  so the first member added in 2026 after the founding 28 is `NHSS-26029`. The 3-digit width caps the
  society at 999 members.
- **Mid-cycle joiners** — a member who joins after a window opens is billed from the next cycle;
  there is no proration.
- **Screenshots are financial documents** on public Cloudinary URLs, where the URL is the only
  protection. Consider `type: authenticated` delivery with signed, expiring URLs for the review page.
- **Member-code enumeration** — codes are sequential and guessable, so the lookup endpoint is a
  name-enumeration oracle. It is rate limited, returns the name only, and 404s uniformly; Cloudflare
  Turnstile is the next step if abuse appears.
- **Corrections** use a soft void on transactions and an `importBatchId` on imported rows, so a bad
  batch is identifiable and reversible.
