-- Constraints Prisma's schema language cannot express.
--
-- WARNING: `prisma db push` diffs the schema against the database and will drop
-- everything in this file without warning. Use `prisma migrate` only. The
-- `pnpm db:verify` script asserts these still exist.

-- ── The strict rule: one ACTIVE submission per member per due month ─────────
--
-- A partial unique index, so REJECTED rows are excluded and a member is free to
-- resubmit for the same month after a rejection. This is the only layer that
-- survives two simultaneous requests; the API check and the form warning above
-- it are for a good error message, not for correctness.
CREATE UNIQUE INDEX "payment_submissions_active_member_month_key"
  ON "payment_submissions" ("member_id", "due_year", "due_month")
  WHERE "status" IN ('PENDING', 'APPROVED');

-- ── Ledger integrity ────────────────────────────────────────────────────────

-- Money moved is always a positive amount; direction is carried by `type`.
ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_amount_positive" CHECK ("amount_paisa" > 0);

-- An income row must carry an income category and no expense head; an expense
-- row the reverse, with either a category FK or free text.
ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_category_shape" CHECK (
    ("type" = 'INCOME'
      AND "income_category" IS NOT NULL
      AND "expense_category_id" IS NULL
      AND "expense_category_text" IS NULL)
    OR
    ("type" = 'EXPENSE'
      AND "income_category" IS NULL
      AND ("expense_category_id" IS NOT NULL OR "expense_category_text" IS NOT NULL))
  );

-- Every manual entry must say what the money was for.
ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_note_not_blank" CHECK (length(btrim("note")) > 0);

-- ── Amounts are never negative ──────────────────────────────────────────────

ALTER TABLE "due_payments"
  ADD CONSTRAINT "due_payments_amounts_non_negative" CHECK (
    "amount_due_paisa" >= 0
    AND "amount_paid_paisa" >= 0
    AND "fine_paisa" >= 0
    AND "fine_paid_paisa" >= 0
    AND "fine_paid_paisa" <= "fine_paisa"
  );

ALTER TABLE "monthly_due_settings"
  ADD CONSTRAINT "monthly_due_settings_amount_non_negative" CHECK ("amount_paisa" >= 0);

ALTER TABLE "payment_submissions"
  ADD CONSTRAINT "payment_submissions_amount_positive" CHECK ("amount_paisa" > 0);

-- ── Month ranges ────────────────────────────────────────────────────────────

ALTER TABLE "due_payments"
  ADD CONSTRAINT "due_payments_month_range" CHECK ("month" BETWEEN 1 AND 12);

ALTER TABLE "monthly_due_settings"
  ADD CONSTRAINT "monthly_due_settings_month_range" CHECK ("month" BETWEEN 1 AND 12);

ALTER TABLE "payment_submissions"
  ADD CONSTRAINT "payment_submissions_due_month_range" CHECK ("due_month" BETWEEN 1 AND 12);

-- ── Payment medium requires the matching detail fields ──────────────────────
--
-- Mobile banking needs a provider and a sender number; every other medium needs
-- a bank name. The form enforces this too, but the API is public.
ALTER TABLE "payment_submissions"
  ADD CONSTRAINT "payment_submissions_medium_shape" CHECK (
    ("payment_medium" = 'MOBILE_BANKING'
      AND "mobile_banking_provider" IS NOT NULL
      AND "mobile_banking_number" IS NOT NULL)
    OR
    ("payment_medium" <> 'MOBILE_BANKING'
      AND "bank_name" IS NOT NULL)
  );

-- A rejection must say why.
ALTER TABLE "payment_submissions"
  ADD CONSTRAINT "payment_submissions_rejection_has_reason" CHECK (
    "status" <> 'REJECTED' OR length(btrim(coalesce("rejection_reason", ''))) > 0
  );

-- ── Member-code sequence ────────────────────────────────────────────────────
--
-- Seeded at 0. Incremented inside the member-creating transaction so a rollback
-- rolls the number back and the sequence stays continuous.
INSERT INTO "counters" ("key", "value") VALUES ('member_code', 0)
  ON CONFLICT ("key") DO NOTHING;
