-- Change ticket_reply.id from a TEXT id to an auto-incrementing integer.
-- The old string ids can't be cast to int, so the column is dropped and re-added
-- as SERIAL; existing rows are renumbered by the new sequence.
ALTER TABLE "ticket_reply" DROP CONSTRAINT "ticket_reply_pkey";
ALTER TABLE "ticket_reply" DROP COLUMN "id";
ALTER TABLE "ticket_reply" ADD COLUMN "id" SERIAL NOT NULL;
ALTER TABLE "ticket_reply" ADD CONSTRAINT "ticket_reply_pkey" PRIMARY KEY ("id");
