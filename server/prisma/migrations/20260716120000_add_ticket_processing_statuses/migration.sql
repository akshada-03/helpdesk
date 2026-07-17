-- Add the system-managed intake states to the ticket status enum. Existing
-- values (open/resolved/closed) are unchanged; these are appended so a ticket can
-- be created `new` and moved through `processing` by the auto-resolve worker
-- before landing on a terminal, agent-visible status.
ALTER TYPE "TicketStatus" ADD VALUE 'new';
ALTER TYPE "TicketStatus" ADD VALUE 'processing';
