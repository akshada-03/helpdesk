import { Router } from "express";
import type {
  TicketListItem,
  TicketListResponse,
} from "core/schemas/tickets.ts";

import prisma from "../db";

export const ticketsRouter = Router();

// Ticket list for agents/admins. requireAuth is applied by the parent apiRouter,
// so any authenticated user may read tickets (both roles handle them). Minimal by
// design — newest first, no filtering yet.
ticketsRouter.get("/", async (_req, res) => {
  const tickets = await prisma.ticket.findMany({
    select: {
      id: true,
      subject: true,
      requesterEmail: true,
      requesterName: true,
      status: true,
      category: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const body: TicketListResponse = {
    tickets: tickets.map(
      (ticket): TicketListItem => ({
        ...ticket,
        createdAt: ticket.createdAt.toISOString(),
      }),
    ),
  };
  res.json(body);
});
