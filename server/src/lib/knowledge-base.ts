import { readFileSync } from "node:fs";
import { join } from "node:path";

// The support knowledge base the auto-responder answers from. It lives as a
// Markdown file at the server root (server/knowledge-base.md) rather than in code
// so support staff can edit policies without a deploy.
//
// Read lazily and cached: the file is small and effectively static for the life of
// the process, so reading it once on first use (not at import) keeps the module
// side-effect-free — importing lib/queue, which pulls this in, must not touch the
// filesystem just to register a worker.
const KNOWLEDGE_BASE_PATH = join(import.meta.dir, "../../knowledge-base.md");

let cached: string | null = null;

// Returns the knowledge base text, reading it from disk on first call. Throws if
// the file is missing — the auto-resolve worker catches that and leaves the ticket
// for an agent, so a misplaced file degrades to "no auto-resolution" rather than a
// crash.
export function loadKnowledgeBase(): string {
  if (cached === null) {
    cached = readFileSync(KNOWLEDGE_BASE_PATH, "utf8");
  }
  return cached;
}
