# Build Prompt: ষোলো সমবায় সমিতি (Sholo Somobay Samity) Management Website

## Overview
Build a full-stack web application to manage a cooperative society ("সমবায় সমিতি") named
"ষোলো সমবায় সমিতি" with a fixed base of 28 members (admin can add/remove members over time).
The system tracks monthly member subscriptions (চাঁদা), late-payment fines, other income, expenses,
member-submitted payment proofs, and gives the admin a dashboard overview plus per-member profiles.

## Tech Stack (required)
- **Frontend + Backend**: Next.js 14+ (App Router), TypeScript
- **API**: Next.js Route Handlers (app/api/*)
- **Database**: PostgreSQL
- **ORM**: Prisma (recommended for schema + migrations, but any Postgres client is acceptable)
- **Image upload/hosting**: Cloudinary (member profile photos, payment screenshots)
- **Auth**: Simple admin authentication (email/password with hashed passwords + sessions or JWT).
  Only one role is described in the spec ("admin") — build admin-only auth for now. Members interact
  only through a public, no-login payment submission form. Schema should stay open to add a "member
  login" role later if needed.

## Core Data Models

### Member
- id (UUID)
- member_code (string, unique, format: `NHSS-25001`, `NHSS-25002`, ... — prefix `NHSS`, then a
  2-digit year code, then a zero-padded sequence number; auto-generate on creation. Sequence
  increments continuously; year code reflects the year the member was added — confirm with client
  if a different rule is wanted.)
- name
- father_name
- mobile
- email
- photo_url (Cloudinary URL)
- is_active (boolean — soft-remove instead of hard delete, so historical records stay intact)
- created_at, updated_at

### MonthlyDueSetting
- id
- month (1-12)
- year
- amount (চাঁদার পরিমাণ, set by admin per month — months can have different amounts)
- created_at, updated_at
- Unique constraint on (month, year)

### DuePayment (per member, per month)
- id
- member_id (FK -> Member)
- month, year (which month's due this payment is for — the "due month", per the 21st–20th cycle
  below, not the calendar month the money was actually sent in)
- amount_due (copied from MonthlyDueSetting at time of generation, for historical accuracy even if
  the setting changes later)
- amount_paid
- fine_amount (৳200 flat if paid late, else 0)
- paid_at (nullable — null means unpaid)
- status (enum: PENDING, PAID_ON_TIME, PAID_LATE, UNPAID)
- note (optional)
- source_submission_id (nullable FK -> PaymentSubmission — links back to the member-submitted
  proof that generated this record, when applicable; null for admin-entered/historical rows)

### Transaction (general ledger — covers both income and expense)
- id
- type (enum: INCOME, EXPENSE)
- category (enum for INCOME: MONTHLY_DUE, FINE, OTHER_INCOME; enum for EXPENSE: free-text or
  admin-defined expense categories, e.g. "office rent", "printing", "event cost", etc.)
- amount
- member_id (nullable FK -> Member — set when tied to a specific member, e.g. a fine or due
  payment; null for general expenses or "other" income not tied to a member)
- note (required for manual entries — what the money was for)
- entry_date (the date the transaction is recorded/effective for)
- created_by (admin id)
- created_at

### PaymentSubmission (member-facing payment proof, reviewed by admin)
- id (UUID)
- member_id (FK -> Member) — looked up/selected via **ID Number** (NHSS code); auto-fill name once
  matched
- name (auto-filled at submission time, stored for record-keeping even if member record changes)
- sending_date (date the member sent the money)
- amount
- transaction_id (bKash/Nagad/bank reference number)
- payment_medium (enum: `NPSB`, `EFT`, `MOBILE_BANKING`, `CASH_DEPOSIT`)
- bank_name (nullable — required when payment_medium is NPSB/EFT/Cash Deposit)
- mobile_banking_provider (nullable enum: `BKASH`, `NAGAD` — required when MOBILE_BANKING)
- mobile_banking_number (nullable — sender's bKash/Nagad number, required when MOBILE_BANKING)
- screenshot_url (Cloudinary URL, required — proof of transaction)
- due_month, due_year (derived from sending_date via the 21st–20th cycle rule at submission time —
  see cycle logic below; this is what the one-per-month constraint is enforced against)
- status (enum: `PENDING`, `APPROVED`, `REJECTED`)
- reviewed_by (nullable, admin id)
- reviewed_at (nullable)
- rejection_reason (nullable)
- created_at

### HistoricalImport (bulk backfill tool)
No separate table strictly required — this feeds into DuePayment/Transaction directly, but log
each backfill batch (id, description, performed_by, created_at) so the admin can audit what was
imported and when.

## Business Logic

### Monthly due cycle (critical — implement exactly as specified)
- The collection window for **month M**'s due is: **21st of month (M-1) at 00:00:00** through
  **20th of month M at 23:59:59**.
  - Example: April's due can be paid from March 21, 00:00 through April 20, 23:59.
- If a member has not paid month M's due by the 20th, 23:59:59, a **flat, one-time ৳200 fine** is
  added (not daily/compounding).
- A scheduled job (Vercel Cron or equivalent) should run just after each month's deadline to:
  1. Mark all still-PENDING DuePayments for that month UNPAID → apply the ৳200 fine.
  2. Auto-generate the next month's DuePayment rows for every active member using the current
     MonthlyDueSetting amount (flag for admin if the amount hasn't been set yet).

### Admin manual money entry
- Admin can add an income entry any time: category (Monthly Due / Fine / Other), optional member
  link, required note.
- Admin can add an expense entry any time: amount, category/head, required note.
- This manual path is also the correct way to handle duplicate/erroneous member payments — it is
  NOT subject to the one-submission-per-month rule below (that rule applies only to the member-
  facing form).

### Historical (past year) data import
Two distinct import modes:
1. **Per-member fine import**: admin selects a member (by NHSS ID), enters month/year + fine amount
   → recorded as an income Transaction (category FINE) tied to that member.
2. **Uniform contribution import**: admin enters an amount + month/year once → creates one
   DuePayment/Transaction record for **every active member** automatically, no per-member repeats.

### Member Payment Submission Flow
After sending money, a member fills a public, no-login form (e.g. `/pay/submit`) to log the
transaction for admin review. This does **not** count as paid until approved — it sits PENDING.

**Form fields, in order:**
1. ID Number* (NHSS code — validate exists; auto-fill Name)
2. Name* (auto-filled, editable in case of mismatch)
3. Sending Date*
4. Amount*
5. Transaction ID*
6. Payment Medium* — select: NPSB / EFT / Mobile Banking / Cash Deposit
   - If **Mobile Banking** → show Provider (bKash/Nagad) + Sender Number
   - If **NPSB / EFT / Cash Deposit** → show Bank Name
7. Screenshot of Transaction* (image upload → Cloudinary)

**Admin review queue** (`/admin/payment-submissions`):
- List PENDING submissions with details + screenshot preview.
- **Approve**: creates the DuePayment for the matching due_month/due_year (status PAID_ON_TIME or
  PAID_LATE based on `sending_date` vs. the 20th-deadline — not the review date, so a slow admin
  review never unfairly penalizes a member) + a matching INCOME Transaction. Sets status APPROVED.
- **Reject**: sets status REJECTED with a reason; no DuePayment/Transaction created. Member can
  resubmit for the same month after rejection (see constraint below).

### Strict rule: one payment submission per member per month
A member may have only **one** active (PENDING or APPROVED) PaymentSubmission per due_month/due_year.
Enforce at every layer:
1. **DB**: partial unique index —
   `UNIQUE (member_id, due_month, due_year) WHERE status IN ('PENDING', 'APPROVED')`
   — REJECTED rows are excluded, so a member can resubmit after rejection.
2. **API**: before insert, check for an existing PENDING/APPROVED submission for that
   member/due_month/due_year and reject with a clear error message if found.
3. **Form UX**: once the member enters their ID Number, check via API whether a submission for the
   current due month already exists and warn/disable before they fill out the rest of the form.

## Pages / Screens

1. **Admin login**
2. **Dashboard** (`/admin`)
   - Total active members
   - Total money collected to date
   - Total fines collected to date
   - Total "other income" to date
   - Total expenses to date
   - Current month's collection status (paid vs. pending count)
   - Pending payment-submission count (needs review)
3. **Members list** (`/admin/members`) — table + add/edit/deactivate, photo upload via Cloudinary
4. **Member profile** (`/admin/members/[id]`) — details, full month-by-month payment history,
   running total contributed
5. **Monthly due settings** (`/admin/dues/settings`) — set/edit চাঁদা amount per month
6. **Transactions** (`/admin/transactions`) — list/filter all income & expense entries; add-income
   and add-expense forms with required note field
7. **Payment submissions review** (`/admin/payment-submissions`) — approve/reject queue described
   above
8. **Historical import** (`/admin/import`) — per-member fine import + uniform contribution import
9. **Public payment submission form** (`/pay/submit`) — member-facing, no login required

## Notes / Assumptions to confirm with the client
- Only admin login is built for v1 — members do not get their own dashboard/login.
- The ৳200 fine is a flat one-time charge per missed deadline, not daily/recurring.
- Member codes increment sequentially per creation order; year prefix reflects the year the member
  was added.
- Deactivated members are soft-deleted (is_active = false) so historical dues/fines stay intact.
- Member-facing submissions are always reviewed by admin before affecting official records — the
  one-per-month rule applies to this self-service form only, not to admin manual entries.
