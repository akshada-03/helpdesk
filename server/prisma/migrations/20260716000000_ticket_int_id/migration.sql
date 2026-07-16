-- Change ticket.id from a TEXT id (app-generated UUID) to an auto-incrementing
-- integer, and follow it through the ticket_reply.ticketId foreign key.
--
-- The old ids ("seed-ticket-061", UUIDs) can't be cast to int, so new numbers are
-- assigned. Unlike the reply_int_id migration, the column can't simply be dropped
-- and re-added: ticket_reply.ticketId points at it, and dropping the old ids would
-- lose the only link between a reply and its ticket. So both sides get a new int
-- column, the replies are remapped through the old text ids while those still
-- exist, and only then are the text columns dropped.
--
-- Existing tickets are renumbered by age (createdAt), so ticket #1 is the oldest.
-- Any URL or bookmark holding an old text id is dead after this — unavoidable when
-- the id type itself changes.

-- 1. New int column on ticket, numbered by age. ROW_NUMBER (not SERIAL) so the
--    order is deterministic rather than physical row order; id breaks createdAt ties.
ALTER TABLE "ticket" ADD COLUMN "id_int" INTEGER;

WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS rn
  FROM "ticket"
)
UPDATE "ticket" t
SET "id_int" = n.rn
FROM numbered n
WHERE t."id" = n."id";

-- 2. New int FK column on ticket_reply, resolved through the still-present text ids.
ALTER TABLE "ticket_reply" ADD COLUMN "ticketId_int" INTEGER;

UPDATE "ticket_reply" r
SET "ticketId_int" = t."id_int"
FROM "ticket" t
WHERE r."ticketId" = t."id";

-- Guard: the FK is ON DELETE CASCADE, so every reply must have matched a ticket.
-- A NULL here means the remap missed a row — abort rather than silently drop the
-- thread on the next step (this whole migration runs in one transaction).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ticket_reply" WHERE "ticketId_int" IS NULL) THEN
    RAISE EXCEPTION 'ticket_reply rows did not map to a ticket — aborting id migration';
  END IF;
END $$;

-- 3. Drop the old constraints and text columns, and swap the int columns in.
ALTER TABLE "ticket_reply" DROP CONSTRAINT "ticket_reply_ticketId_fkey";
ALTER TABLE "ticket" DROP CONSTRAINT "ticket_pkey";

ALTER TABLE "ticket" DROP COLUMN "id";
ALTER TABLE "ticket" RENAME COLUMN "id_int" TO "id";

ALTER TABLE "ticket_reply" DROP COLUMN "ticketId";
ALTER TABLE "ticket_reply" RENAME COLUMN "ticketId_int" TO "ticketId";

-- 4. Restore the primary key and give it a sequence, so the DB assigns ids from
--    here on (the webhook no longer supplies one).
ALTER TABLE "ticket" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_pkey" PRIMARY KEY ("id");

CREATE SEQUENCE "ticket_id_seq" OWNED BY "ticket"."id";
-- Start after the highest existing number so the first new ticket doesn't collide.
SELECT setval('ticket_id_seq', COALESCE((SELECT MAX("id") FROM "ticket"), 0) + 1, false);
ALTER TABLE "ticket" ALTER COLUMN "id" SET DEFAULT nextval('ticket_id_seq');

-- 5. Restore the foreign key, unchanged apart from its type.
ALTER TABLE "ticket_reply" ALTER COLUMN "ticketId" SET NOT NULL;
ALTER TABLE "ticket_reply" ADD CONSTRAINT "ticket_reply_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
