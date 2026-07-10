import { spawnSync } from "node:child_process";
import { Client } from "pg";
import { TEST_DATABASE_URL, serverDir } from "./config";

// Creates the test database if it does not already exist. `CREATE DATABASE`
// cannot run inside the target database, so we connect to the `postgres`
// maintenance database on the same server.
async function ensureDatabaseExists() {
  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.replace(/^\//, "");

  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = "/postgres";
  adminUrl.search = "";

  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbName]
    );
    if (rowCount === 0) {
      // Identifier can't be parameterized; dbName comes from our own config.
      await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
      console.log(`[e2e] Created test database "${dbName}".`);
    } else {
      console.log(`[e2e] Test database "${dbName}" already exists.`);
    }
  } finally {
    await client.end();
  }
}

// Runs a command in the server workspace with the test database URL injected.
// dotenv (in prisma.config.ts) and Bun's .env autoload both defer to an
// already-set env var, so DATABASE_URL here wins over server/.env.
function runInServer(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    cwd: serverDir,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      DATABASE_URL: TEST_DATABASE_URL,
      NODE_ENV: "test",
    },
  });
  if (result.status !== 0) {
    throw new Error(
      `[e2e] Command failed (exit ${result.status}): ${command} ${args.join(" ")}`
    );
  }
}

export default async function globalSetup() {
  await ensureDatabaseExists();
  // Apply all migrations to the test database.
  runInServer("bunx", ["prisma", "migrate", "deploy"]);
  // Seed the admin user so login-based flows have credentials to use.
  runInServer("bun", ["prisma/seed.ts"]);
}
