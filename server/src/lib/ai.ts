import { generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod/v4";

import {
  ticketCategories,
  type ReplySenderType,
  type TicketCategory,
} from "core/constants/ticket.ts";

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
// Whether the AI env vars are all set. Callers use this to decide whether to invoke
// an AI feature at all — e.g. the webhook only enqueues classification when AI is
// configured, so an unconfigured server doesn't queue jobs that can only fail.
export function isAiConfigured(): boolean {
  return Boolean(AI_BASE_URL && AI_API_KEY && AI_MODEL);
}

function model() {
  // Re-checked inline (rather than via isAiConfigured) so TypeScript narrows the
  // three vars from `string | undefined` to `string` for the calls below.
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

// Instructions for the ticket classifier. Each category is described by intent
// rather than keyword so the model routes on what the customer wants, not on
// surface words ("refund" appears in plenty of non-refund questions). The default
// is called out explicitly: an ambiguous ticket should land in general_question
// rather than being forced into a technical or refund bucket it doesn't belong in.
//
// The model is told to answer with the bare identifier because the output is fed
// straight into an enum column after validation — any prose would just be noise to
// strip.
const CLASSIFY_SYSTEM_PROMPT = `You classify an inbound customer support ticket \
into exactly one category.

Categories:
- general_question — a general inquiry, account or how-to question, feedback, or \
anything that is not a technical problem or a refund. Use this as the default when \
the ticket is unclear or fits none of the others well.
- technical_question — a bug, error, outage, broken feature, or anything not \
working that needs technical troubleshooting.
- refund_request — the customer wants their money back, a cancellation with a \
refund, or is disputing a charge.

Rules:
- Pick the single category that best matches the customer's primary intent.
- Respond with ONLY the exact identifier — general_question, technical_question, or \
refund_request — in lower snake_case. No punctuation, quotes, explanation, or any \
other words.`;

// The model's answer is untrusted text, so validate it against the real category
// set before it ever reaches the enum column (per project convention: Zod for any
// external/untrusted data).
const categorySchema = z.enum(ticketCategories);

// Classifies an inbound ticket into one of the fixed TicketCategory values from its
// subject and body. Used to auto-fill `category` on tickets created from inbound
// email; the caller runs it in the background (see lib/classify.ts), so this just
// does the model call and validation.
//
// Throws if the model call fails or returns something that isn't a known category —
// the caller logs and moves on, leaving the ticket unclassified rather than writing
// a bogus value.
export async function classifyTicket(input: {
  subject: string;
  body: string;
}): Promise<TicketCategory> {
  const { text } = await generateText({
    model: model(),
    system: CLASSIFY_SYSTEM_PROMPT,
    prompt: `Subject: ${input.subject}

Message:
${input.body}`,
  });

  // Prefer an exact match on the normalized answer; the categories are already
  // lowercase, so this just forgives stray whitespace or capitalization.
  const normalized = text.trim().toLowerCase();
  const exact = categorySchema.safeParse(normalized);
  if (exact.success) return exact.data;

  // Fall back to finding a known identifier inside a wrapped answer (e.g. the model
  // returned "Category: refund_request." despite the instruction). Only rescues an
  // otherwise-correct answer; genuinely unrecognized output still throws.
  const found = ticketCategories.find((category) =>
    normalized.includes(category),
  );
  if (found) return found;

  throw new Error(
    `Model returned an unrecognized category: ${JSON.stringify(text)}`,
  );
}

// Instructions for the auto-responder. On a ticket's arrival the system tries to
// close it without a human by answering purely from the support knowledge base.
// The guardrails all pull one way — never answer beyond the knowledge base —
// because a confident wrong answer sent automatically is far worse than handing
// the ticket to an agent: there's no human in the loop to catch it.
//
// The knowledge base carries its own escalation rules (refunds outside the
// window, legal/chargeback threats, account-security issues, low confidence); the
// prompt is told to treat those as hard stops that force a handoff. The model
// answers with strict JSON so the worker can act on a machine-readable decision
// rather than parsing prose.
const AUTO_RESOLVE_SYSTEM_PROMPT = `You are a first-line customer support agent for \
Code with Mosh. You are given the official support knowledge base and one inbound \
customer ticket. Decide whether the ticket can be fully and safely resolved right \
now using ONLY the knowledge base, and if so, write the reply to send.

Resolve the ticket (canResolve = true) only when ALL of these hold:
- The knowledge base clearly and completely answers the customer's question or \
request. If it only partially covers it, or you would have to guess, do not resolve.
- None of the knowledge base's escalation rules apply. Re-read its escalation \
section and hand off (canResolve = false) whenever any of them is triggered — legal \
threats, refunds outside the stated window, chargebacks or payment disputes, \
account-security concerns, or anything where your confidence is low.
- The request does not require an action only a human or another system can take \
(issuing a refund, changing an account, looking up order-specific data). Explaining \
a policy is fine; performing the action is not.

When you resolve, write "reply" as a complete, professional, and genuinely \
customer-friendly message:
- Answer using only facts from the knowledge base. Never invent policies, \
timelines, links, or steps that are not in it.
- Open with a greeting on its own line that addresses the customer by the name given \
in "Customer's first name", copied exactly, in the form "Hi <first name>,". If that \
field says the name is unknown, use "Hi there," instead — never guess a name.
- Keep the tone warm, respectful, and reassuring: briefly acknowledge what the \
customer asked, be genuinely helpful, and never sound curt, robotic, or dismissive.
- Format the reply for easy reading: use short paragraphs separated by a blank line, \
and a numbered or bulleted list whenever you give steps or several points. Never cram \
everything into one dense block of text.
- Before the sign-off, add a short, friendly closing line inviting the customer to \
reply if they need anything else.
- End with exactly this sign-off, on its own two lines:
Best regards,
Code with Mosh Support
- Do not add a subject line, and do not wrap the reply in quotes or markdown.
- Match the language of the ticket.

When you do NOT resolve, set canResolve = false and set "reply" to an empty string.

Respond with ONLY a JSON object, no code fences or commentary, in exactly this shape:
{"canResolve": boolean, "reply": string}`;

// The model's decision, validated before the worker acts on it. `reply` is only
// meaningful when canResolve is true; the schema keeps both fields present so a
// truncated/garbled response fails the parse rather than being half-trusted.
const autoResolveSchema = z.object({
  canResolve: z.boolean(),
  reply: z.string(),
});

// The outcome the auto-resolve worker acts on: either a ready-to-send reply, or a
// decision to leave the ticket for a human. Discriminated so a `resolved` result
// always carries the reply text and an unresolved one never does.
export type AutoResolveResult =
  | { resolved: true; reply: string }
  | { resolved: false };

// Pulls the JSON object out of the model's answer. The prompt asks for bare JSON,
// but models still occasionally wrap it in ```json fences or add a stray word, so
// we slice from the first "{" to the last "}" before parsing rather than trusting
// the response to be clean. Returns null when there's nothing object-shaped to try.
function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

// Attempts to resolve an inbound ticket from the knowledge base alone. Returns
// whether it was resolved and, if so, the customer-facing reply to send. The
// knowledge base is passed in (read from disk by the caller) rather than embedded
// here so the policy content stays editable without touching code.
//
// A resolution requires a non-empty reply: the model can say canResolve = true, but
// an empty reply is treated as "not resolved" so we never post a blank message. The
// caller runs this in the background (see lib/auto-resolve.ts) and treats a throw or
// an unresolved result the same way — leave the ticket for an agent.
//
// Throws if the model call fails or returns something that isn't the expected JSON;
// the caller catches that and falls back to handing the ticket to a human.
export async function autoResolveTicket(input: {
  subject: string;
  body: string;
  requesterName: string | null;
  knowledgeBase: string;
}): Promise<AutoResolveResult> {
  const customerFirstName = firstName(input.requesterName);

  const { text } = await generateText({
    model: model(),
    system: AUTO_RESOLVE_SYSTEM_PROMPT,
    prompt: `Knowledge base:
${input.knowledgeBase}

---

Customer's first name: ${customerFirstName ?? "(unknown — use a neutral greeting)"}

Ticket subject: ${input.subject}

Ticket message:
${input.body}`,
  });

  const parsed = autoResolveSchema.safeParse(extractJson(text));
  if (!parsed.success) {
    throw new Error(
      `Auto-resolver returned an unparseable response: ${JSON.stringify(text)}`,
    );
  }

  // Guard against a "resolved" verdict with no message — posting an empty reply
  // would be worse than handing the ticket to an agent.
  const reply = parsed.data.reply.trim();
  if (parsed.data.canResolve && reply) {
    return { resolved: true, reply };
  }
  return { resolved: false };
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
