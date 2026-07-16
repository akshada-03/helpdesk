import prisma from "../src/db";

// Seeds a long, realistic reply thread onto one ticket, for exercising anything
// that has to cope with a conversation rather than a one-liner — the AI summarizer,
// the thread UI's scrolling and agent/customer offsetting, reply ordering.
//
// Usage (from server/):
//   bun run db:seed:replies         # seeds the default ticket below
//   bun run db:seed:replies 42      # seeds ticket 42 instead
//
// Destructive and idempotent: it DELETES the target ticket's existing replies and
// re-inserts the scripted thread, so re-running gives the same 20 replies rather
// than 40. It only ever touches the one ticket named on the command line.
const DEFAULT_TICKET_ID = 103;

// The thread, oldest first. The ticket it targets says only "please help", so the
// conversation opens the way a real one would — the agent asking what's actually
// wrong — and turns into a concrete 2FA lockout from there. Written as an arc
// (diagnose → rule out → verify identity → reset → confirm) so a summary of it has
// something real to say: an outcome, and a clear "who is waiting on whom".
//
// `agent: true` means an app User wrote it; false means the customer replied by
// email. The two alternate strictly, starting with the agent.
const THREAD: { agent: boolean; body: string }[] = [
  {
    agent: true,
    body: `Hi Sam,

Thanks for getting in touch, and sorry you're having trouble.

I'd like to help, but your message only says "please help" — I don't yet know what
went wrong, so I don't want to guess and send you down the wrong path.

Could you tell me a bit more:

- What were you trying to do when the problem happened?
- What did you expect to happen, and what happened instead?
- Was there an error message on screen? The exact wording helps a lot.
- Roughly what time did you first notice it?
- Is it happening every time, or only sometimes?

Even a screenshot of the screen you're stuck on would move this along quickly.

Best regards,
Alex`,
  },
  {
    agent: false,
    body: `Sorry, I sent that in a hurry — I was locked out and frustrated.

Here's the detail:

I'm trying to log in to my account at the normal sign-in page. I type my email and
password, and that part seems fine, because it then asks me for the six-digit code
from my authenticator app.

That's where it fails. I open the app, type the code while it's still showing, and
the site says:

"That code isn't valid. Please try again."

I've tried maybe fifteen times since yesterday morning, on both my laptop and my
phone. Same result every time. It started sometime on Monday — it worked fine last
week and I haven't changed anything that I know of.`,
  },
  {
    agent: true,
    body: `Hi Sam,

That's very helpful, thank you — and that error narrows things down a lot. Your
password is fine; it's specifically the second factor being rejected.

The most common cause is the clock on the phone running the authenticator app.
Those codes are generated from the current time, so if the phone's clock has drifted
by more than about thirty seconds, every code it produces will look wrong to us even
though you're typing them correctly.

A few questions so I can confirm that's what's happening:

- Which authenticator app are you using?
- Is your phone's date and time set automatically, or did you set it by hand?
- Have you travelled across a time zone recently, or changed the time manually?
- When you type the code, does the app still show it, or has it just rolled over?

Best regards,
Alex`,
  },
  {
    agent: false,
    body: `Answers:

- The app is Google Authenticator on an Android phone.
- Time is set automatically, as far as I can tell. I went into Settings > System >
  Date & time and "Set time automatically" is switched on.
- I haven't travelled anywhere. I've been in the same city all month.
- I'm typing it while it's still showing. I've been careful about that because I
  assumed the same thing you did — I wait for a fresh code, type it immediately,
  and submit well before it rolls over.

One thing I noticed that might matter: I got a new phone about ten days ago and
moved my apps across. The authenticator came over with everything else and it's
been fine since then, right up until Monday.`,
  },
  {
    agent: true,
    body: `Hi Sam,

The new phone is a very useful detail — thank you for mentioning it.

When an authenticator is restored onto a new device, it sometimes carries the app
across without carrying the underlying secret for each account. The app will happily
keep showing six-digit codes, and they look completely normal, but they're being
generated from the wrong seed, so they'll never be accepted. From your side it's
indistinguishable from "the codes just stopped working".

That fits what you're describing: it worked on the old phone, the app survived the
move, and then it started failing.

Before I act on that theory, could you check one thing? Open the authenticator and
tell me exactly what the entry for us is called, and whether you see one entry or
two.

Best regards,
Alex`,
  },
  {
    agent: false,
    body: `Just looked.

There are two entries, which I hadn't noticed before because I never scroll down in
that app.

The first one is named after your company with my work email underneath it. That's
the one I've been using — it's at the top of the list and it's the one I always tap.

The second one is further down and just says my email address with no company name
next to it. It's showing a different six-digit code from the first one.

I have no memory of setting up two. Should I be trying the second one? I didn't want
to start typing random codes in case that locks the account completely — I've
already had a lot of failed attempts and I don't want to make this worse.`,
  },
  {
    agent: true,
    body: `Hi Sam,

Good instinct on both counts, and I'm glad you asked rather than guessing.

Yes — please try the code from the second entry, the one showing just your email
address. That's very likely the live one: the older entry is probably a leftover
that no longer matches what we hold.

On your worry about locking the account: you won't. Repeated failures here slow the
attempts down rather than locking you out permanently, and I can see the attempts
are all coming from you. So it's safe to try.

If the second entry works, we'll delete the stale one so this can't bite you again.
If it doesn't, we'll go down the identity-verification route and reset your second
factor from our side.

Best regards,
Alex`,
  },
  {
    agent: false,
    body: `Tried it. No luck.

The second entry's code is rejected the same way, with the same message:

"That code isn't valid. Please try again."

I tried it three times, each time with a freshly generated code, and I typed each
one within a couple of seconds of it appearing. I also tried the first entry once
more immediately afterwards just to be sure I hadn't mixed them up. Same rejection.

So both entries are being refused.

I'm starting to think the codes on this phone are just not the right ones at all,
which matches what you said about the secret not coming across properly. What do we
do now? I do need to get back in — there's work sitting behind this login and I'm
already two days behind on it.`,
  },
  {
    agent: true,
    body: `Hi Sam,

Understood, and thank you for testing both — that rules out the simple explanation
and confirms the one we suspected. Neither entry on the new phone holds a working
secret, so no code that phone produces will ever be accepted.

That means we reset your second factor from our side and you enrol the new phone
fresh. Before I can do that, I have to verify you're the account holder — resetting
someone's 2FA on the strength of an email is exactly how accounts get stolen, so we
hold this line for everyone, including when it's inconvenient.

Two options:

1. Backup codes. When you first set up 2FA we showed you ten single-use codes. Any
   one of them gets you straight in, no reset needed.
2. Identity verification, if the backup codes are gone.

Do you still have those backup codes?

Best regards,
Alex`,
  },
  {
    agent: false,
    body: `I remember the backup codes screen. I'm fairly sure I did the sensible thing at the
time and saved them.

The problem is where I saved them.

I've checked:

- My password manager — nothing under your company's entry, just the password.
- My downloads folder on the old laptop — nothing obviously named like backup codes.
- My email, searching for your company name — I can find the original welcome mail
  but nothing with codes in it.
- A folder where I keep scanned documents — nothing there either.

I have a vague memory of screenshotting them, and that screenshot would have been on
the old phone, which I traded in when I got the new one. So realistically: they're
gone. Let's do the identity verification.`,
  },
  {
    agent: true,
    body: `Hi Sam,

That's a very common ending to the backup code story, so don't feel bad about it.
Identity verification it is.

Here's what I need. Please reply with:

- The approximate month and year you first created the account.
- The billing postcode on file, if your plan is a paid one.
- The last four digits of the card we bill, if applicable.
- The name of one other person at your organisation who has an account with us.
- The subject line of any support ticket you've raised with us before this one.

You don't need to get all five perfect — I'm looking for a consistent picture, not a
memory test. Please don't send a full card number or a password; I never need those
and I'd have to discard the message if you did.

Best regards,
Alex`,
  },
  {
    agent: false,
    body: `Here's what I can give you:

- Account created: I think March 2024. It was definitely spring, and definitely
  before our team's April planning cycle, so March is my best answer.
- Billing postcode: SW1A 1AA.
- Last four of the card: 4417. It's the company card, ending 4417.
- Another person here with an account: Priya Raman. She's on the same team and I
  believe she set hers up around the same time I did.
- Previous ticket subject: I raised one last year about exporting a report to CSV.
  I think the subject was something like "CSV export missing columns", though I
  can't swear to the exact wording.

Let me know if you need anything else. Happy to jump on a call if that's easier.`,
  },
  {
    agent: true,
    body: `Hi Sam,

That all lines up with what we hold. The postcode and the card match exactly, Priya's
account is on your organisation, and your previous ticket was "CSV export missing
columns — quarterly report", so you were close enough on that too. The account was
created in March 2024, as you said.

I'm satisfied you're the account holder, so here's what I've done:

- Cleared the stale second-factor secret from your account.
- Removed both dead authenticator entries from our side.
- Sent a re-enrolment link to your work address. It's valid for one hour.

The link takes you to a page with a QR code. Delete both old entries from your
authenticator first, then scan the new one. Tell me when it arrives.

Best regards,
Alex`,
  },
  {
    agent: false,
    body: `Got the email, it came through within about thirty seconds.

I've done what you said:

- Deleted both old entries from Google Authenticator. The list is now empty for your
  company, which felt slightly alarming but I trust the process.
- Opened the link from the email on my laptop.
- Scanned the QR code with the phone.

A new entry has appeared in the authenticator with your company name and my work
email underneath it, and it's generating codes.

The page is now asking me to confirm by entering a code. Before I do — is there
anything I should do differently this time so I don't end up in the same place when
I next change phones? I'd rather not repeat these two days.`,
  },
  {
    agent: true,
    body: `Hi Sam,

Yes — go ahead and enter the code to confirm. That step is what tells us the new
secret is really on your phone.

On not repeating this, three things, in order of how much they'd have helped:

- Save the new backup codes properly this time. You'll be shown ten of them straight
  after you confirm. Put them in your password manager, in the same entry as your
  password. That is the single thing that would have turned these two days into two
  minutes.
- Don't rely on the app surviving a phone migration. Some restores carry the app but
  not the secrets, which is exactly what happened to you.
- When you next change phones, re-enrol before you trade the old one in, while you
  can still generate valid codes from it.

Best regards,
Alex`,
  },
  {
    agent: false,
    body: `I'm in.

The code was accepted first time and I'm looking at my dashboard now for the first
time since Monday. Thank you — genuinely.

I've saved the ten backup codes into my password manager, in the same entry as the
password, exactly as you suggested. I've also made a note to myself to re-enrol
before I next swap phones rather than after.

One more thing, and I don't know whether it's related or a separate problem: I'm
being asked to sign in again on my laptop each time I close the browser. It never
used to do that — it used to remember me for weeks. It's not urgent now that I can
actually get in, but it's mildly annoying and I wondered if it's a leftover from
everything above.`,
  },
  {
    agent: true,
    body: `Hi Sam,

Glad you're back in.

That one is expected, and it is related. When I cleared the second factor, that
invalidated every existing session on the account — that's deliberate, because if
someone else had been in there, resetting 2FA without kicking out their sessions
would have achieved nothing.

So your laptop's "remember me" was thrown away along with everything else. The first
sign-in you did rebuilt it, but it will only start persisting again once you've
signed in and stayed signed in.

If it's still asking every single time by tomorrow, that's not the reset — that's
your browser clearing cookies on exit, which is a setting on your side. Tell me if
so and I'll walk you through where to look.

Best regards,
Alex`,
  },
  {
    agent: false,
    body: `That makes sense, and it explains the timing.

I'll leave it overnight and see how it behaves tomorrow. If it's still asking every
time I'll check the browser's "clear cookies on exit" setting before bothering you
again — I have a feeling I might have turned that on myself a while back when I was
trying to fix something unrelated.

Thank you for sticking with this. I know I gave you almost nothing to go on at the
start, and you got me from "please help" to a working login without making me feel
stupid about the backup codes.

I'm happy for this to be closed. If the session thing is still happening tomorrow
I'll open a new ticket rather than reopening this one, unless you'd rather I reply
here.`,
  },
  {
    agent: true,
    body: `Hi Sam,

Thank you — that's kind, and no, you gave me plenty once I asked.

To summarise where we ended up, so it's on the record:

- The cause was a second-factor secret that didn't survive your phone migration.
  Both authenticator entries were generating codes from the wrong seed.
- We verified your identity, cleared the dead secret, and you re-enrolled the new
  phone.
- Your backup codes are saved in your password manager now.
- The repeated sign-ins are the session invalidation that came with the reset.

Reply here if the sign-in prompt is still happening tomorrow — this ticket has the
history, so it's the better place. I'll leave it open until then rather than closing
it now.

Best regards,
Alex`,
  },
  {
    agent: false,
    body: `Perfect, thanks.

Quick update this morning, as promised: the laptop remembered me overnight. I closed
the browser, reopened it, and went straight to the dashboard without being asked for
anything. So that resolved itself exactly as you said it would, and I didn't need to
touch the cookie setting.

Everything is working:

- Login works with the new authenticator entry.
- The session persists across browser restarts.
- Backup codes are saved somewhere I'll actually find them.

Nothing further needed from my side. Please do close this one. Thanks again for the
patience and for explaining the why at each step rather than just telling me what to
click — it's the first time I've actually understood what 2FA is doing.`,
  },
];

async function main() {
  // Ticket id from argv, defaulting above. Parsed strictly so a typo can't quietly
  // seed the wrong ticket (or NaN its way into a Prisma error).
  const arg = process.argv[2];
  const ticketId = arg === undefined ? DEFAULT_TICKET_ID : Number(arg);
  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    throw new Error(`Invalid ticket id: ${arg}`);
  }

  // The requirement is a thread of substantial messages, so enforce it here rather
  // than trusting the prose above to stay that way if it's ever edited.
  THREAD.forEach((reply, i) => {
    const lines = reply.body.split("\n").length;
    if (lines < 10) {
      throw new Error(`Reply ${i + 1} has ${lines} lines; each must have at least 10`);
    }
  });
  if (!THREAD.every((reply, i) => reply.agent === (i % 2 === 0))) {
    throw new Error("Thread must strictly alternate, starting with an agent");
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, subject: true, createdAt: true },
  });
  if (!ticket) {
    throw new Error(`Ticket ${ticketId} not found — nothing to attach replies to`);
  }

  // Agent replies need an author. Any active agent will do; prefer a non-admin so
  // the thread reads like normal support work rather than an admin doing frontline.
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
    throw new Error("No active user to author agent replies — run db:seed first");
  }

  const deleted = await prisma.ticketReply.deleteMany({ where: { ticketId } });

  // Space the thread out over the days following the ticket, so createdAt ordering
  // is meaningful and the timestamps look like a real back-and-forth rather than 20
  // messages in the same second. Deterministic (no randomness) so re-running the
  // seed reproduces the same thread exactly.
  const start = ticket.createdAt.getTime() + 30 * 60_000;
  const gaps = [47, 96, 23, 181, 64, 39, 152, 28, 73, 210, 55, 34, 88, 19, 127, 41, 96, 640, 62];

  let at = start;
  for (const [i, reply] of THREAD.entries()) {
    if (i > 0) at += gaps[(i - 1) % gaps.length]! * 60_000;
    await prisma.ticketReply.create({
      data: {
        ticketId,
        body: reply.body,
        // Plain text, like a real agent composing in the UI — the HTML column is
        // for inbound email that carried an HTML part.
        bodyHtml: null,
        senderType: reply.agent ? "agent" : "customer",
        // Customer replies arrive by email and have no app User behind them.
        authorId: reply.agent ? author.id : null,
        createdAt: new Date(at),
      },
    });
  }

  const agents = THREAD.filter((r) => r.agent).length;
  console.log(
    `Seeded ticket ${ticket.id} ("${ticket.subject}") with ${THREAD.length} replies ` +
      `(${agents} agent / ${THREAD.length - agents} customer), authored by ${author.name}.`,
  );
  if (deleted.count > 0) {
    console.log(`Replaced ${deleted.count} pre-existing repl${deleted.count === 1 ? "y" : "ies"}.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
