import { generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import type { ReplySenderType } from "core/constants/ticket.ts";

import { AI_API_KEY, AI_BASE_URL, AI_MODEL } from "./env";

// Model access for the app's AI features, via the Vercel AI SDK.
//
// The provider, endpoint, and model are entirely env-driven (AI_BASE_URL /
// AI_API_KEY / AI_MODEL) rather than hardcoded, so switching model — or moving to
// a different vendor altogether — is a .env edit with no code change. Any service
// exposing an OpenAI-compatible /chat/completions endpoint works, which includes
// Gemini, Groq, OpenRouter, and a local Ollama. See server/.env.example.
//
// Built lazily: constructing the provider reads the env vars, and doing that at
// import time would make an unconfigured server fail to boot even for the routes
// that never touch AI (and would break the tests, which stub this module).
function model() {
  if (!AI_BASE_URL || !AI_API_KEY || !AI_MODEL) {
    throw new Error(
      "AI is not configured — set AI_BASE_URL, AI_API_KEY, and AI_MODEL in server/.env",
    );
  }

  const provider = createOpenAICompatible({
    name: "ai",
    baseURL: AI_BASE_URL,
    apiKey: AI_API_KEY,
  });
  return provider(AI_MODEL);
}

// The leading word of a full name, used for first-name greetings and sign-offs.
// Derived here rather than asked of the model so the name itself is never a
// generation: the model is handed the exact word to use.
//
// This is a deliberate simplification — it takes the first whitespace-separated
// token, which is wrong for names that lead with a family name or a title. Support
// replies are informal enough that "greet by the leading name" is the right trade,
// and getting it wrong is a slightly-off greeting rather than a broken reply.
// Returns null for a missing or blank name, which callers treat as "unknown".
function firstName(fullName: string | null): string | null {
  const first = fullName?.trim().split(/\s+/)[0];
  return first ? first : null;
}

// Instructions for the ticket summarizer. Agents read a summary to get back up to
// speed on a thread they may not have worked, so the rules pull hard against the
// two failure modes that would make it untrustworthy: inventing a resolution that
// never happened, and burying the current state under a retelling of every message.
//
// The summary is read-only context, never sent to the customer, so it addresses the
// agent about the conversation rather than participating in it — hence no greeting,
// no sign-off, and third-person references to both sides.
const SUMMARY_SYSTEM_PROMPT = `You are an assistant for customer support agents. \
Summarize a support ticket and its conversation history so an agent can catch up at \
a glance.

Rules:
- Summarize only what is in the ticket and replies. Never invent facts, promises, \
causes, or outcomes that are not stated.
- Lead with the customer's core problem or request in one sentence.
- Then cover what has happened since: what the agents asked or advised, what the \
customer answered, and anything still outstanding.
- Make the current state explicit — whether the issue looks resolved, is waiting on \
the customer, or is waiting on the team. If the conversation does not say, write \
that it is unclear rather than guessing.
- Be brief and factual: at most one short paragraph, or a few terse bullet points \
if there are distinct threads. Do not restate every message in order.
- Write about the customer and the agents in the third person. This is an internal \
note for an agent, not a message to the customer.
- Refer to people by name or by role ("the customer", "the agent"). Never infer \
anyone's gender from their name: do not use "he" or "she" unless the conversation \
itself states which to use. Where a pronoun is unavoidable, use "they".
- Do not add a greeting, a sign-off, a title, or any preamble such as "Here is a \
summary". Return ONLY the summary text.
- Match the language of the ticket.`;

// One message in a ticket's conversation, as handed to the summarizer. Only the
// fields the prompt actually uses — the caller projects a reply row down to this.
export type SummaryReply = {
  senderType: ReplySenderType;
  authorName: string | null;
  body: string;
};

// Renders the thread as labelled, chronological turns for the prompt. Each turn is
// attributed to "Customer" or the named agent, since who said what is exactly the
// thing a summary has to get right — an agent's own suggestion misread as the
// customer's report would invert the ticket's meaning.
//
// Empty threads never reach here (the caller substitutes its own text), so this
// always renders at least one turn.
function formatThread(replies: SummaryReply[]): string {
  return replies
    .map((reply) => {
      const who =
        reply.senderType === "agent"
          ? `Agent${reply.authorName ? ` (${reply.authorName})` : ""}`
          : "Customer";
      return `${who}:\n${reply.body}`;
    })
    .join("\n\n");
}

// Summarizes a ticket and its conversation history for the agent working it.
// Nothing is persisted: the caller regenerates on demand, so the summary always
// reflects the thread as it stands rather than a stale snapshot.
//
// The inbound message is passed separately from `replies` because it is the ticket
// itself, not a turn in the thread — the model is told to lead with the problem it
// describes. A ticket with no replies yet is still summarizable (it collapses to
// "summarize this message"), so an empty thread is normal rather than an error.
//
// Throws if the model call fails or comes back empty — callers surface that as a
// 502 rather than showing the agent a blank summary.
export async function summarizeTicket(input: {
  subject: string;
  ticketBody: string;
  requesterName: string | null;
  replies: SummaryReply[];
}): Promise<string> {
  const { text } = await generateText({
    model: model(),
    system: SUMMARY_SYSTEM_PROMPT,
    prompt: `Support ticket subject: ${input.subject}

Customer's name: ${input.requesterName ?? "(unknown)"}

The customer's original message:
${input.ticketBody}

The conversation since (oldest first):
${
  input.replies.length > 0
    ? formatThread(input.replies)
    : "(no replies yet — nobody has responded to the customer)"
}`,
  });

  const summary = text.trim();
  if (!summary) {
    throw new Error("Model returned an empty summary");
  }
  return summary;
}

// Instructions for the reply polisher. The draft is the agent's own words, so the
// rewrite has to preserve their meaning rather than invent support commitments —
// hence the emphasis on not adding facts. The model returns the reply text alone
// because the client drops the result straight into the compose box.
//
// The greeting/sign-off rules are strict because the names are the one part of the
// output that must be exactly right: a reply signed with the wrong agent, or
// greeting a customer by a hallucinated name, is worse than no polish at all. Both
// names arrive already reduced to a first name (see firstName), so the model is
// told to copy them verbatim rather than shorten anything itself.
const POLISH_SYSTEM_PROMPT = `You are an editor for customer support agents. \
Rewrite the agent's draft reply so it is clear, friendly, and professional.

Rules:
- Preserve the draft's meaning, intent, and every concrete detail. Never invent \
facts, promises, apologies, timelines, or policies that are not in the draft.
- Fix grammar, spelling, and punctuation. Improve flow and tone.
- Keep it concise. Do not pad with filler or restate the customer's problem at length.
- Match the draft's language.
- Open with a greeting that addresses the customer by the name given in \
"Customer's first name", copied exactly as given. If that field says the name is \
unknown, use "Hello," instead — never guess a name, and never write a placeholder.
- End the reply with exactly this sign-off, on its own two lines:
Best regards,
<the name given in "Agent's first name", copied exactly as given>
- Do not add a job title, company, or contact details to the sign-off.
- The reply must contain exactly one greeting and one sign-off. If the draft \
already has either, rewrite it rather than adding a second one.
- Do not add a subject line, and do not wrap the reply in quotes or markdown.
- Return ONLY the rewritten reply text, with no preamble or commentary.`;

// Rewrites an agent's draft reply. The ticket's subject and original message are
// passed as context so the rewrite can read naturally against the conversation,
// but the draft remains the sole source of facts (see the prompt rules above).
//
// The polished reply greets the customer and is signed off by the agent, both by
// first name only (reduced from the full names here, not by the model). Requesters
// come from inbound email, so `requesterName` is often absent (roughly a fifth of
// tickets) — pass null and the greeting falls back to a neutral one rather than a
// guessed or placeholder name.
//
// Throws if the model call fails or comes back empty — callers surface that as a
// 502 rather than silently returning the unpolished draft.
export async function polishReply(input: {
  draft: string;
  subject: string;
  ticketBody: string;
  requesterName: string | null;
  agentName: string;
}): Promise<string> {
  const customerFirstName = firstName(input.requesterName);
  // An app User always has a name, but guard anyway: a blank one would otherwise
  // ask the model to sign off with nothing.
  const agentFirstName = firstName(input.agentName) ?? input.agentName;

  const { text } = await generateText({
    model: model(),
    system: POLISH_SYSTEM_PROMPT,
    prompt: `Support ticket subject: ${input.subject}

Customer's first name: ${customerFirstName ?? "(unknown — use a neutral greeting)"}

Customer's message:
${input.ticketBody}

Agent's first name: ${agentFirstName}

The agent's draft reply to rewrite:
${input.draft}`,
  });

  const polished = text.trim();
  if (!polished) {
    throw new Error("Model returned an empty reply");
  }
  return polished;
}
