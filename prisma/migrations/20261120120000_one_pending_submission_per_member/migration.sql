-- ── One unreviewed form per member ─────────────────────────────────────────
--
-- `payment_submissions_active_member_month_key` allows one active submission
-- per member *per due month*, which is not enough on its own. NHSS-25024 filed
-- ৳10,200 targeting November and then ৳7,200 targeting October three minutes
-- later; the two different target months made them look like two legitimate
-- forms to that index, and both were approved.
--
-- Two forms sitting in the queue can be approved in either order, and whichever
-- is approved second finds the months already settled and books its money as
-- surplus other income. So a member may have at most one form awaiting review.
--
-- APPROVED is excluded or nobody could ever pay a second month, and REJECTED is
-- excluded so a member may refile after a rejection.
--
-- WARNING: `prisma db push` will drop this without warning. Use `prisma migrate`
-- only; `pnpm db:verify` asserts it still exists.
CREATE UNIQUE INDEX "payment_submissions_one_pending_per_member"
  ON "payment_submissions" ("member_id")
  WHERE "status" = 'PENDING';
