-- CreateEnum
CREATE TYPE "DuePaymentStatus" AS ENUM ('PENDING', 'PAID_ON_TIME', 'PAID_LATE', 'UNPAID');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentMedium" AS ENUM ('NPSB', 'EFT', 'MOBILE_BANKING', 'CASH_DEPOSIT');

-- CreateEnum
CREATE TYPE "MobileBankingProvider" AS ENUM ('BKASH', 'NAGAD');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "IncomeCategory" AS ENUM ('MONTHLY_DUE', 'FINE', 'OTHER_INCOME');

-- CreateEnum
CREATE TYPE "ImportKind" AS ENUM ('FINE_IMPORT', 'UNIFORM_DUE_IMPORT');

-- CreateTable
CREATE TABLE "admins" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ADMIN',
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" UUID NOT NULL,
    "member_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "father_name" TEXT,
    "mobile" TEXT,
    "email" TEXT,
    "photo_url" TEXT,
    "photo_public_id" TEXT,
    "joined_on" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deactivated_on" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_due_settings" (
    "id" UUID NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "amount_paisa" INTEGER NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "monthly_due_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "due_payments" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "amount_due_paisa" INTEGER NOT NULL DEFAULT 0,
    "amount_paid_paisa" INTEGER NOT NULL DEFAULT 0,
    "fine_paisa" INTEGER NOT NULL DEFAULT 0,
    "fine_paid_paisa" INTEGER NOT NULL DEFAULT 0,
    "paid_at" TIMESTAMPTZ(3),
    "status" "DuePaymentStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "source_submission_id" UUID,
    "import_batch_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "due_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_submissions" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "member_code_snapshot" TEXT NOT NULL,
    "sending_date" DATE NOT NULL,
    "amount_paisa" INTEGER NOT NULL,
    "transaction_ref" TEXT NOT NULL,
    "payment_medium" "PaymentMedium" NOT NULL,
    "bank_name" TEXT,
    "mobile_banking_provider" "MobileBankingProvider",
    "mobile_banking_number" TEXT,
    "screenshot_url" TEXT NOT NULL,
    "screenshot_public_id" TEXT,
    "due_month" INTEGER NOT NULL,
    "due_year" INTEGER NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "rejection_reason" TEXT,
    "submitter_ip_hash" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "type" "TransactionType" NOT NULL,
    "income_category" "IncomeCategory",
    "expense_category_id" UUID,
    "expense_category_text" TEXT,
    "amount_paisa" INTEGER NOT NULL,
    "member_id" UUID,
    "due_payment_id" UUID,
    "source_submission_id" UUID,
    "import_batch_id" UUID,
    "note" TEXT NOT NULL,
    "entry_date" DATE NOT NULL,
    "created_by" UUID,
    "idempotency_key" TEXT,
    "voided_at" TIMESTAMPTZ(3),
    "void_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historical_imports" (
    "id" UUID NOT NULL,
    "kind" "ImportKind" NOT NULL,
    "description" TEXT NOT NULL,
    "month" INTEGER,
    "year" INTEGER,
    "amount_paisa" INTEGER,
    "affected_count" INTEGER NOT NULL DEFAULT 0,
    "performed_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historical_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counters" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "counters_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "job_runs" (
    "id" UUID NOT NULL,
    "job" TEXT NOT NULL,
    "period_key" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),
    "result" JSONB,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "members_member_code_key" ON "members"("member_code");

-- CreateIndex
CREATE INDEX "members_is_active_idx" ON "members"("is_active");

-- CreateIndex
CREATE INDEX "members_name_idx" ON "members"("name");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_due_settings_year_month_key" ON "monthly_due_settings"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "due_payments_source_submission_id_key" ON "due_payments"("source_submission_id");

-- CreateIndex
CREATE INDEX "due_payments_year_month_status_idx" ON "due_payments"("year", "month", "status");

-- CreateIndex
CREATE INDEX "due_payments_status_idx" ON "due_payments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "due_payments_member_id_year_month_key" ON "due_payments"("member_id", "year", "month");

-- CreateIndex
CREATE INDEX "payment_submissions_member_id_due_year_due_month_status_idx" ON "payment_submissions"("member_id", "due_year", "due_month", "status");

-- CreateIndex
CREATE INDEX "payment_submissions_status_created_at_idx" ON "payment_submissions"("status", "created_at");

-- CreateIndex
CREATE INDEX "payment_submissions_due_year_due_month_idx" ON "payment_submissions"("due_year", "due_month");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_name_key" ON "expense_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_idempotency_key_key" ON "transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "transactions_type_entry_date_idx" ON "transactions"("type", "entry_date");

-- CreateIndex
CREATE INDEX "transactions_type_income_category_entry_date_idx" ON "transactions"("type", "income_category", "entry_date");

-- CreateIndex
CREATE INDEX "transactions_member_id_entry_date_idx" ON "transactions"("member_id", "entry_date");

-- CreateIndex
CREATE INDEX "transactions_entry_date_idx" ON "transactions"("entry_date");

-- CreateIndex
CREATE INDEX "transactions_voided_at_idx" ON "transactions"("voided_at");

-- CreateIndex
CREATE INDEX "historical_imports_created_at_idx" ON "historical_imports"("created_at");

-- CreateIndex
CREATE INDEX "job_runs_job_started_at_idx" ON "job_runs"("job", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "job_runs_job_period_key_key" ON "job_runs"("job", "period_key");

-- AddForeignKey
ALTER TABLE "due_payments" ADD CONSTRAINT "due_payments_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "due_payments" ADD CONSTRAINT "due_payments_source_submission_id_fkey" FOREIGN KEY ("source_submission_id") REFERENCES "payment_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "due_payments" ADD CONSTRAINT "due_payments_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "historical_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_submissions" ADD CONSTRAINT "payment_submissions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_submissions" ADD CONSTRAINT "payment_submissions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_due_payment_id_fkey" FOREIGN KEY ("due_payment_id") REFERENCES "due_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_source_submission_id_fkey" FOREIGN KEY ("source_submission_id") REFERENCES "payment_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_expense_category_id_fkey" FOREIGN KEY ("expense_category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "historical_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historical_imports" ADD CONSTRAINT "historical_imports_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
