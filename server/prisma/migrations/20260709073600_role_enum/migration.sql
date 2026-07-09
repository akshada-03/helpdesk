-- Convert user.role from text to the Role enum in place (no data loss).
CREATE TYPE "Role" AS ENUM ('admin', 'agent');

ALTER TABLE "user" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "user" ALTER COLUMN "role" TYPE "Role" USING ("role"::"Role");
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'agent';
