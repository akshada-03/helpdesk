import prisma from "../src/db";
import { auth } from "../src/lib/auth";
import { Role } from "../src/generated/prisma/enums";

// Seeds an admin user. Credentials come from env (SEED_ADMIN_EMAIL /
// SEED_ADMIN_PASSWORD) since public sign-up is disabled. Idempotent: re-running
// leaves an existing user in place and just ensures the admin role.
async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({ where: { email }, data: { role: Role.admin } });
    console.log(`User ${email} already exists — ensured role=admin.`);
    return;
  }

  // Hash the password with Better Auth's own hasher so sign-in accepts it.
  const ctx = await auth.$context;
  const hashedPassword = await ctx.password.hash(password);
  const now = new Date();

  const user = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      email,
      name: "Admin",
      emailVerified: true,
      role: Role.admin,
      createdAt: now,
      updatedAt: now,
    },
  });

  // Credential provider account holds the password hash for email/password login.
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

  console.log(`Seeded admin user: ${email} (role=admin).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
