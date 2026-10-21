-- CreateTable
CREATE TABLE "personal_loans" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "amount_paisa" INTEGER NOT NULL,
    "lent_on" DATE NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "personal_loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personal_repayments" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "amount_paisa" INTEGER NOT NULL,
    "paid_on" DATE NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "personal_repayments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "personal_loans_member_id_idx" ON "personal_loans"("member_id");

-- CreateIndex
CREATE INDEX "personal_loans_lent_on_idx" ON "personal_loans"("lent_on");

-- CreateIndex
CREATE INDEX "personal_repayments_member_id_idx" ON "personal_repayments"("member_id");

-- CreateIndex
CREATE INDEX "personal_repayments_paid_on_idx" ON "personal_repayments"("paid_on");

-- AddForeignKey
ALTER TABLE "personal_loans" ADD CONSTRAINT "personal_loans_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_repayments" ADD CONSTRAINT "personal_repayments_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma has no declarative CHECK, so the "a sum of money is positive" rule is
-- hand-written here, the same way the transactions and due_payments checks are.
-- A zero or negative row would silently skew every balance on the page.
ALTER TABLE "personal_loans"
  ADD CONSTRAINT "personal_loans_amount_positive" CHECK ("amount_paisa" > 0);

ALTER TABLE "personal_repayments"
  ADD CONSTRAINT "personal_repayments_amount_positive" CHECK ("amount_paisa" > 0);
