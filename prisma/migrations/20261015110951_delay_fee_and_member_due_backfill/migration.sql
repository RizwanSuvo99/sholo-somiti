-- Both values are inserted at the position they occupy in schema.prisma rather
-- than appended, so the database's enum order matches the schema and later
-- migrations report no drift.

-- AlterEnum
ALTER TYPE "ImportKind" ADD VALUE 'MEMBER_DUE_BACKFILL';

-- AlterEnum
ALTER TYPE "IncomeCategory" ADD VALUE 'DELAY_FEE' BEFORE 'OTHER_INCOME';
