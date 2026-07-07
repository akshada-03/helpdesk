import "dotenv/config";
import { defineConfig, env } from "prisma/config";

type Env = {
  DATABASE_URL: string;
};

// Configures the Prisma CLI (migrate, studio, generate). Prisma 7 does not
// auto-load .env, so `dotenv/config` above makes DATABASE_URL available.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env<Env>("DATABASE_URL"),
  },
});
