import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth";
import { apiRouter } from "./routes";

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

app.use(cors({ origin: process.env.CLIENT_URL ?? "http://localhost:3000", credentials: true }));

// Better Auth handles its own body parsing — mount BEFORE express.json().
app.all("/api/auth/*", toNodeHandler(auth));

app.use(express.json());

app.use("/api", apiRouter);

// 404 fallback for unknown API routes
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});
