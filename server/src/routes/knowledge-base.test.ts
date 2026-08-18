import { describe, expect, it } from "bun:test";
import { KNOWLEDGE_ARTICLES } from "./knowledge-base";

describe("knowledgeBaseRouter data", () => {
  it("contains articles across all core categories", () => {
    expect(KNOWLEDGE_ARTICLES.length).toBeGreaterThan(10);

    const categories = new Set(KNOWLEDGE_ARTICLES.map((a) => a.category));
    expect(categories.has("Account & Login")).toBe(true);
    expect(categories.has("Refund Policy")).toBe(true);
    expect(categories.has("Certificates")).toBe(true);
    expect(categories.has("Downloading Content")).toBe(true);
    expect(categories.has("Technical Issues")).toBe(true);
  });

  it("classifies each article with an explicit resolutionType", () => {
    for (const article of KNOWLEDGE_ARTICLES) {
      expect(["instant_ai", "agent_review"]).toContain(article.resolutionType);
      expect(article.question.length).toBeGreaterThan(5);
      expect(article.answer.length).toBeGreaterThan(10);
      expect(article.exampleKeywords.length).toBeGreaterThan(0);
    }
  });

  it("marks action-required requests as agent_review", () => {
    const refundRequest = KNOWLEDGE_ARTICLES.find((a) => a.id === "refund-request");
    expect(refundRequest?.resolutionType).toBe("agent_review");

    const emailChange = KNOWLEDGE_ARTICLES.find((a) => a.id === "change-email");
    expect(emailChange?.resolutionType).toBe("agent_review");
  });

  it("marks standard FAQs as instant_ai", () => {
    const forgotPw = KNOWLEDGE_ARTICLES.find((a) => a.id === "forgot-password");
    expect(forgotPw?.resolutionType).toBe("instant_ai");

    const certs = KNOWLEDGE_ARTICLES.find((a) => a.id === "certificates");
    expect(certs?.resolutionType).toBe("instant_ai");
  });
});
