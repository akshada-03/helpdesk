import prisma from "../src/db";
import {
  TicketCategory,
  TicketStatus,
} from "../src/generated/prisma/enums";

// Seeds a realistic spread of support tickets for Code with Mosh, so the agent UI
// (list, filters, detail, thread) has something lifelike to render and the AI
// intake pipeline has representative examples.
//
// The set is grounded in server/knowledge-base.md and deliberately spans the
// outcomes the auto-resolver produces:
//   - `resolved` tickets that carry an AI reply (an agent-type reply with NO
//     author — the system answered from the knowledge base), exactly as the
//     auto-resolve worker writes them.
//   - `open` tickets the AI hands to a human: either not covered by the knowledge
//     base, or caught by its escalation rules (out-of-window refunds, chargebacks,
//     account-security concerns).
//   - a couple of `closed` tickets for history.
// The system-managed `new`/`processing` states are transient (a live ticket only
// sits in them for the seconds the worker runs) and are hidden from agents, so
// there's nothing meaningful to seed there.
//
// Usage (from server/):
//   bun run db:seed:tickets
//
// Destructive and idempotent: it deletes any ticket whose requester email is in
// the seeded set (cascading to that ticket's replies) and re-inserts the batch, so
// re-running reproduces the same tickets rather than piling up duplicates. It only
// ever touches tickets with these seed addresses — real/other tickets are left
// alone.

// One reply to attach to a seeded ticket. `authored: false` mirrors the AI
// auto-reply (senderType "agent", authorId null); `authored: true` is a real agent
// reply and gets the seed's chosen author.
type SeedReply = {
  body: string;
  authored: boolean;
};

type SeedTicket = {
  subject: string;
  body: string;
  requesterEmail: string;
  requesterName: string | null;
  status: TicketStatus;
  category: TicketCategory | null;
  // Whether to assign the ticket to the chosen agent (open work / handled history).
  assign?: boolean;
  // A single reply to seed onto the ticket (the AI resolution, or an agent note).
  reply?: SeedReply;
  // How many days before "now" the ticket arrived — spreads createdAt so ordering
  // and the "Created" column look real. Deterministic (no randomness).
  daysAgo: number;
};

// A knowledge-base-grounded auto-reply, in the shape the auto-resolver emits:
// greeting the customer (or a neutral "Hello," when the name is unknown), then an
// answer drawn only from the KB, closed with the fixed support sign-off.
function aiReply(body: string): SeedReply {
  return { body, authored: false };
}

const TICKETS: SeedTicket[] = [
  // --- AI-resolved from the knowledge base (status "resolved", system reply) ---
  {
    subject: "How do I reset my password?",
    body: "Hi, I can't remember my password and can't log in. How do I reset it?",
    requesterEmail: "emma.wilson@gmail.com",
    requesterName: "Emma Wilson",
    status: TicketStatus.resolved,
    category: TicketCategory.general_question,
    daysAgo: 18,
    reply: aiReply(`Hello Emma,

You can reset your password yourself in just a few steps:

1. Go to the login page.
2. Click "Forgot Password".
3. Enter your registered email address.
4. Follow the instructions in the reset email we send you.

If the email doesn't arrive within about 10 minutes, please check your spam or promotions folder — that's usually where it ends up.

Best regards,
Akshada Hadal`),
  },
  {
    subject: "Question about your refund policy",
    body: "Before I buy, what exactly is your refund policy if the course isn't for me?",
    requesterEmail: "kbuyer2291@outlook.com",
    requesterName: null,
    status: TicketStatus.resolved,
    category: TicketCategory.refund_request,
    daysAgo: 16,
    reply: aiReply(`Hello,

Happy to explain our refund policy:

- We offer a 30-day money-back guarantee.
- You'll receive a full refund if you request it within 30 days of purchase.
- A partial refund is available if less than 80% of the course has been completed.
- Once 80% or more of a course is completed, it's no longer eligible for a refund.

Refunds are typically processed within 5-10 business days. If you'd like to go ahead, just reply with your order receipt and the reason for your request.

Best regards,
Akshada Hadal`),
  },
  {
    subject: "Videos won't play",
    body: "None of the course videos are playing for me today. The player just spins. Help!",
    requesterEmail: "liam.brown@proton.me",
    requesterName: "Liam Brown",
    status: TicketStatus.resolved,
    category: TicketCategory.technical_question,
    daysAgo: 14,
    reply: aiReply(`Hello Liam,

Sorry to hear the videos aren't playing. A few things usually clear this up:

- Clear your browser cache.
- Use the latest version of Chrome or Edge.
- Disable any browser extensions that might interfere.
- Check that your internet connection is stable.

Give those a try and let us know if you're still stuck.

Best regards,
Akshada Hadal`),
  },
  {
    subject: "Can I download the videos to watch offline?",
    body: "I travel a lot and have poor wifi on planes. Can I download the lessons to watch offline?",
    requesterEmail: "sophia.lee@gmail.com",
    requesterName: "Sophia Lee",
    status: TicketStatus.resolved,
    category: TicketCategory.general_question,
    daysAgo: 12,
    reply: aiReply(`Hello Sophia,

Thanks for asking! Here's how it works with our courses:

- Course videos are streamed online and aren't available for offline download.
- Source code, however, is fully downloadable.

So while the videos can't be saved locally, you can grab all the source code to work alongside them.

Best regards,
Akshada Hadal`),
  },
  {
    subject: "Do you give certificates?",
    body: "Does finishing a course get me a certificate I can show my employer?",
    requesterEmail: "dev.aspirant88@yahoo.com",
    requesterName: null,
    status: TicketStatus.resolved,
    category: TicketCategory.general_question,
    daysAgo: 10,
    reply: aiReply(`Hello,

Yes - a certificate is issued upon course completion, and you'll find it in your dashboard once you've finished.

Do note that these are certificates of completion, not accredited degrees, so they're best used to show the topics you've covered rather than as a formal qualification.

Best regards,
Akshada Hadal`),
  },
  {
    subject: "My coupon code isn't working",
    body: "I have a coupon code SAVE20 but it won't apply at checkout. What's going on?",
    requesterEmail: "ava.thompson@gmail.com",
    requesterName: "Ava Thompson",
    status: TicketStatus.resolved,
    category: TicketCategory.general_question,
    daysAgo: 8,
    reply: aiReply(`Hello Ava,

Sorry the coupon isn't applying. This usually comes down to one of a few things:

- The coupon has expired.
- It has already been used.
- It isn't valid for the course you selected.

Also note that only one coupon can be applied per purchase. If none of those seem to fit, reply with the exact code and the course you're buying and we'll take a closer look.

Best regards,
Akshada Hadal`),
  },
  {
    subject: "Can I move my course to a different account?",
    body: "I bought a course on my personal email but want it on my work account. Can you transfer it?",
    requesterEmail: "ethan.walker@gmail.com",
    requesterName: "Ethan Walker",
    status: TicketStatus.resolved,
    category: TicketCategory.general_question,
    daysAgo: 6,
    reply: aiReply(`Hello Ethan,

Thanks for reaching out. Courses are tied to the account that purchased them and are non-transferable, so a course can't be moved to another account.

That said, if you're simply signed in with the wrong account, logging in with the email you used to purchase should bring the course straight back.

Best regards,
Akshada Hadal`),
  },

  // --- Handed to a human: not in the KB, or an escalation rule fired ("open") ---
  {
    subject: "Refund request for the JavaScript course",
    body: "I bought the Complete JavaScript course about 45 days ago and life got in the way so I never started it. I'd like a refund please.",
    requesterEmail: "noah.davis@gmail.com",
    requesterName: "Noah Davis",
    status: TicketStatus.open,
    category: TicketCategory.refund_request,
    assign: true,
    daysAgo: 3,
  },
  {
    subject: "I paid but the course isn't showing up",
    body: "I purchased the React course yesterday and have the receipt, but it isn't in My Courses. I only have one account. Can you check what happened?",
    requesterEmail: "olivia.martin@gmail.com",
    requesterName: "Olivia Martin",
    status: TicketStatus.open,
    category: TicketCategory.general_question,
    assign: true,
    daysAgo: 2,
  },
  {
    subject: "Charged twice - disputing with my bank",
    body: "I've been billed twice for the same course this month. If this isn't fixed today I'll be filing a chargeback with my bank. This is unacceptable.",
    requesterEmail: "james.carter@gmail.com",
    requesterName: "James Carter",
    status: TicketStatus.open,
    category: TicketCategory.refund_request,
    assign: true,
    daysAgo: 1,
  },
  {
    subject: "Feature request: dark mode and offline lessons",
    body: "Loving the courses. Two things I'd really like: a proper dark theme for the site, and an option to download lessons for offline viewing on flights. Any plans for these?",
    requesterEmail: "mia.robinson@gmail.com",
    requesterName: "Mia Robinson",
    status: TicketStatus.open,
    category: TicketCategory.general_question,
    daysAgo: 4,
  },
  {
    subject: "I think someone else accessed my account",
    body: "I got an email about a login from a city I've never been to, and some of my course progress looks different. I'm worried my account is compromised. What should I do?",
    requesterEmail: "isabella.king@gmail.com",
    requesterName: "Isabella King",
    status: TicketStatus.open,
    category: TicketCategory.technical_question,
    assign: true,
    daysAgo: 1,
  },

  // --- History ("closed") ---
  {
    subject: "How do I change my email address?",
    body: "I've switched jobs and want to update the email on my account. How do I do that?",
    requesterEmail: "grace.hall@gmail.com",
    requesterName: "Grace Hall",
    status: TicketStatus.closed,
    category: TicketCategory.general_question,
    assign: true,
    daysAgo: 25,
    reply: {
      authored: true,
      body: `Hello Grace,

To update the email on your account, please reply with:

- Your current email address
- The new email address you'd like to use
- Proof of purchase, if we ask for it

Once we have those, we'll make the change for you.

Best regards,
Akshada Hadal`,
    },
  },
  {
    subject: "Does lifetime access include future updates?",
    body: "If I buy with lifetime access, do I get the updates you make to the course later on, or just the version I bought?",
    requesterEmail: "daniel.evans@gmail.com",
    requesterName: "Daniel Evans",
    status: TicketStatus.closed,
    category: TicketCategory.general_question,
    daysAgo: 22,
    reply: aiReply(`Hello Daniel,

Great question. Lifetime Access means you pay once and keep access permanently, and that includes the future updates we make to that course.

It applies to the specific course you purchased, so the updates you'll receive are the ones for that course.

Best regards,
Akshada Hadal`),
  },
];

async function main() {
  // Agent replies and assignments need a real user. Prefer a non-admin agent so
  // the data reads like normal frontline support; fall back to any active user.
  const author =
    (await prisma.user.findFirst({
      where: { deletedAt: null, role: "agent" },
      select: { id: true, name: true },
    })) ??
    (await prisma.user.findFirst({
      where: { deletedAt: null },
      select: { id: true, name: true },
    }));

  if (!author) {
    console.warn(
      "No active user found — tickets will be seeded unassigned and agent replies left authorless. Run db:seed first for a richer result.",
    );
  }

  // Idempotency: remove any prior run's tickets (matched by the seed addresses),
  // cascading to their replies, before re-inserting.
  const emails = TICKETS.map((t) => t.requesterEmail);
  const deleted = await prisma.ticket.deleteMany({
    where: { requesterEmail: { in: emails } },
  });

  const now = Date.now();

  for (const t of TICKETS) {
    const createdAt = new Date(now - t.daysAgo * 24 * 60 * 60_000);

    const ticket = await prisma.ticket.create({
      data: {
        subject: t.subject,
        body: t.body,
        requesterEmail: t.requesterEmail,
        requesterName: t.requesterName,
        status: t.status,
        category: t.category,
        // Only assign when asked AND we actually have a user to assign to.
        assigneeId: t.assign && author ? author.id : null,
        createdAt,
      },
      select: { id: true },
    });

    if (t.reply) {
      await prisma.ticketReply.create({
        data: {
          ticketId: ticket.id,
          body: t.reply.body,
          bodyHtml: null,
          // Both the AI auto-reply and an agent note are the support side
          // answering, so senderType is always "agent"; the difference is the
          // author — the system reply has none (authorId null).
          senderType: "agent",
          authorId: t.reply.authored && author ? author.id : null,
          // Land the reply shortly after the ticket arrived (auto-resolution is
          // near-instant; the agent note a little later in the day).
          createdAt: new Date(
            createdAt.getTime() + (t.reply.authored ? 3 * 60 * 60_000 : 2 * 60_000),
          ),
        },
      });
    }
  }

  const byStatus = TICKETS.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});
  const summary = Object.entries(byStatus)
    .map(([status, n]) => `${n} ${status}`)
    .join(", ");

  console.log(
    `Seeded ${TICKETS.length} tickets (${summary})` +
      (author ? `, assigned/authored by ${author.name}.` : "."),
  );
  if (deleted.count > 0) {
    console.log(
      `Replaced ${deleted.count} pre-existing seed ticket${deleted.count === 1 ? "" : "s"}.`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
