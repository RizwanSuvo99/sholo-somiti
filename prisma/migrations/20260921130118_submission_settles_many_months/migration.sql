-- DropIndex
DROP INDEX "due_payments_source_submission_id_key";

-- CreateIndex
CREATE INDEX "due_payments_source_submission_id_idx" ON "due_payments"("source_submission_id");
