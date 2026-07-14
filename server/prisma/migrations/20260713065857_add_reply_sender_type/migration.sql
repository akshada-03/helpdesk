/*
  Warnings:

  - Added the required column `senderType` to the `ticket_reply` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ReplySenderType" AS ENUM ('agent', 'customer');

-- AlterTable
ALTER TABLE "ticket_reply" ADD COLUMN     "senderType" "ReplySenderType" NOT NULL;
