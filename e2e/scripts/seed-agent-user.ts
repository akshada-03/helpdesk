// Seeds a non-admin (role=agent) user into the TEST database so E2E tests can
// verify AdminRoute redirects non-admins. This lives in the e2e workspace but is
// executed with `bun` from the SERVER workspace (so Bun autoloads server/.env for
// BETTER_AUTH_SECRET, and the same generated Prisma client / Better Auth hasher
// the app uses are resolved). DATABASE_URL is injected by the caller to point at
// the test DB.
//
// It mirrors server/prisma/seed.ts exactly (Better Auth's own password hasher +
// a `credential` provider account) so the created user can sign in through the
// real UI. Idempotent: re-running leaves an existing agent in place.
import prisma from "../../server/src/db";
import { auth } from "../../server/src/lib/auth";
import { Role } from "../../server/src/generated/prisma/enums";

async function main() {
  const email = process.env.E2E_AGENT_EMAIL;
  const password = process.env.E2E_AGENT_PASSWORD;

  if (!email || !password) {
    throw new Error("E2E_AGENT_EMAIL and E2E_AGENT_PASSWORD must be set");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({ where: { email }, data: { role: Role.agent } });
    console.log(`[e2e] Agent user ${email} already exists — ensured role=agent.`);
    return;
  }

  // Hash with Better Auth's own hasher so the credential sign-in accepts it.
  const ctx = await auth.$context;
  const hashedPassword = await ctx.password.hash(password);
  const now = new Date();

  const user = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      email,
      name: "Agent",
      emailVerified: true,
      role: Role.agent,
      createdAt: now,
      updatedAt: now,
    },
  });

  await prisma.account.create({
    data: {
      id: crypto.randomUUID(),
      accountId: user.id,
      providerId: "credential",
      userId: user.id,
      password: hashedPassword,
      createdAt: now,
      updatedAt: now,
    },
  });

  console.log(`[e2e] Seeded agent user: ${email} (role=agent).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
