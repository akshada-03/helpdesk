import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  HelpCircle,
  Mail,
  Search,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Zap,
} from "lucide-react";

import { api } from "@/lib/api";
import Navbar from "@/components/Navbar";
import ErrorAlert from "@/components/ErrorAlert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

interface KnowledgeArticle {
  id: string;
  category: string;
  question: string;
  answer: string;
  steps?: string[];
  resolutionType: "instant_ai" | "agent_review";
  exampleKeywords: string[];
}

interface KnowledgeBaseResponse {
  supportEmail: string;
  articles: KnowledgeArticle[];
}

export default function KnowledgeBase() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [selectedResolution, setSelectedResolution] = useState<
    "all" | "instant_ai" | "agent_review"
  >("all");
  const [expandedArticleId, setExpandedArticleId] = useState<string | null>(
    null,
  );
  const [copiedEmail, setCopiedEmail] = useState(false);

  const { data, isLoading, error } = useQuery<KnowledgeBaseResponse>({
    queryKey: ["knowledge-base"],
    queryFn: async () => {
      const res = await api.get<KnowledgeBaseResponse>("/api/knowledge-base");
      return res.data;
    },
  });

  const categories = useMemo(() => {
    if (!data?.articles) return ["All"];
    const unique = Array.from(
      new Set(data.articles.map((a) => a.category)),
    ).sort();
    return ["All", ...unique];
  }, [data?.articles]);

  const filteredArticles = useMemo(() => {
    if (!data?.articles) return [];
    const query = searchQuery.trim().toLowerCase();

    return data.articles.filter((article) => {
      // Category filter
      if (selectedCategory !== "All" && article.category !== selectedCategory) {
        return false;
      }
      // Resolution type filter
      if (
        selectedResolution !== "all" &&
        article.resolutionType !== selectedResolution
      ) {
        return false;
      }
      // Search query filter
      if (!query) return true;

      const matchesQuestion = article.question.toLowerCase().includes(query);
      const matchesAnswer = article.answer.toLowerCase().includes(query);
      const matchesCategory = article.category.toLowerCase().includes(query);
      const matchesKeywords = article.exampleKeywords.some((k) =>
        k.toLowerCase().includes(query),
      );
      const matchesSteps = article.steps?.some((s) =>
        s.toLowerCase().includes(query),
      );

      return (
        matchesQuestion ||
        matchesAnswer ||
        matchesCategory ||
        matchesKeywords ||
        matchesSteps
      );
    });
  }, [data?.articles, searchQuery, selectedCategory, selectedResolution]);

  const supportEmail = data?.supportEmail ?? "ahsupport4@gmail.com";

  function handleCopyEmail() {
    navigator.clipboard.writeText(supportEmail);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  }

  function toggleArticle(id: string) {
    setExpandedArticleId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />

      <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 space-y-8">
        {/* Top Header Banner */}
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-primary font-semibold text-sm">
                <BookOpen className="size-4" />
                <span>Help Center & Guidelines</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Support Knowledge Base
              </h1>
              <p className="text-muted-foreground text-sm max-w-xl">
                Explore supported topics, automated resolution guides, and
                guidelines on emailing our support desk.
              </p>
            </div>

            {/* Quick Email Info Card */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 rounded-xl border border-primary/20 bg-background/80 p-3.5 backdrop-blur-sm shadow-xs">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                <Mail className="size-5" />
              </div>
              <div className="min-w-0 pr-2">
                <div className="text-xs text-muted-foreground font-medium">
                  Direct Inbound Support
                </div>
                <div className="text-sm font-semibold truncate font-mono">
                  {supportEmail}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyEmail}
                className="gap-1.5 shrink-0"
              >
                {copiedEmail ? (
                  <>
                    <Check className="size-3.5 text-emerald-500" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" />
                    <span>Copy Address</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Quick Stats / Info Badges */}
          <div className="mt-6 pt-6 border-t border-border/60 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <div className="flex size-6 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-500">
                <Sparkles className="size-3.5" />
              </div>
              <span>
                <strong>24/7 AI Auto-Resolution</strong> for standard inquiries
              </span>
            </div>
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <div className="flex size-6 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                <UserCheck className="size-3.5" />
              </div>
              <span>
                <strong>Human Agent Escalation</strong> for refunds & accounts
              </span>
            </div>
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <div className="flex size-6 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
                <Clock className="size-3.5" />
              </div>
              <span>
                <strong>Instant email acknowledgment</strong> on every inbound
                mail
              </span>
            </div>
          </div>
        </div>

        {/* Search & Filter Controls */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search topics, questions, errors, or keywords..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-10 bg-card"
              />
            </div>
            {/* Resolution Filter Pills */}
            <div className="flex items-center gap-1.5 p-1 bg-card border rounded-lg shrink-0">
              <button
                type="button"
                onClick={() => setSelectedResolution("all")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  selectedResolution === "all"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All Topics
              </button>
              <button
                type="button"
                onClick={() => setSelectedResolution("instant_ai")}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                  selectedResolution === "instant_ai"
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Zap className="size-3" />
                Instant AI
              </button>
              <button
                type="button"
                onClick={() => setSelectedResolution("agent_review")}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                  selectedResolution === "agent_review"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <UserCheck className="size-3" />
                Agent Review
              </button>
            </div>
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-full font-medium whitespace-nowrap border transition-all ${
                  selectedCategory === cat
                    ? "bg-primary/10 border-primary/30 text-primary font-semibold"
                    : "bg-card border-border/80 text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        {error && <ErrorAlert error={error} fallback="Failed to load knowledge base" />}

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-4 w-1/3" />
                  </div>
                  <Skeleton className="size-8 rounded-full" />
                </div>
              </Card>
            ))}
          </div>
        ) : filteredArticles.length === 0 ? (
          <Card className="p-8 text-center border-dashed">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground mb-3">
              <HelpCircle className="size-6" />
            </div>
            <h3 className="text-base font-semibold">No matching topics found</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              We couldn't find any articles matching your search query. You can
              still send an email regarding your inquiry.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategory("All");
                  setSelectedResolution("all");
                }}
              >
                Clear all filters
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span>
                Showing <strong>{filteredArticles.length}</strong> topics
              </span>
              <span>Click a question to view full details & steps</span>
            </div>

            {filteredArticles.map((article) => {
              const isExpanded = expandedArticleId === article.id;
              const isInstantAi = article.resolutionType === "instant_ai";

              return (
                <Card
                  key={article.id}
                  className={`transition-all border hover:border-primary/30 ${
                    isExpanded ? "ring-1 ring-primary/20 shadow-sm" : ""
                  }`}
                >
                  <CardHeader
                    className="p-4 sm:p-5 cursor-pointer select-none"
                    onClick={() => toggleArticle(article.id)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="text-[11px] font-medium bg-muted/60">
                            {article.category}
                          </Badge>
                          {isInstantAi ? (
                            <Badge
                              variant="outline"
                              className="text-[11px] font-medium bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20 gap-1"
                            >
                              <Zap className="size-2.5" />
                              Instant AI Answer
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 gap-1"
                            >
                              <UserCheck className="size-2.5" />
                              Agent Review Required
                            </Badge>
                          )}
                        </div>
                        <CardTitle className="text-base font-semibold leading-snug">
                          {article.question}
                        </CardTitle>
                        {!isExpanded && (
                          <CardDescription className="line-clamp-1 text-xs sm:text-sm">
                            {article.answer}
                          </CardDescription>
                        )}
                      </div>

                      <button
                        type="button"
                        className="flex size-8 shrink-0 items-center justify-center rounded-lg hover:bg-muted text-muted-foreground"
                        aria-label={isExpanded ? "Collapse" : "Expand"}
                      >
                        {isExpanded ? (
                          <ChevronUp className="size-4" />
                        ) : (
                          <ChevronDown className="size-4" />
                        )}
                      </button>
                    </div>
                  </CardHeader>

                  {isExpanded && (
                    <CardContent className="px-4 pb-5 pt-0 sm:px-5 border-t border-border/40 mt-1 pt-4 text-sm space-y-4">
                      <p className="text-foreground/90 leading-relaxed font-medium">
                        {article.answer}
                      </p>

                      {article.steps && article.steps.length > 0 && (
                        <div className="space-y-2 rounded-lg bg-muted/40 p-3.5 border border-border/50">
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Recommended Steps:
                          </div>
                          <ol className="list-decimal list-inside space-y-1.5 text-xs sm:text-sm text-foreground/90">
                            {article.steps.map((step, idx) => (
                              <li key={idx} className="leading-normal pl-1">
                                {step}
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}

                      {/* Example trigger keywords */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-2">
                        <span className="text-xs text-muted-foreground font-medium mr-1">
                          Keywords / Triggers:
                        </span>
                        {article.exampleKeywords.map((kw) => (
                          <span
                            key={kw}
                            className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] font-mono text-muted-foreground"
                          >
                            #{kw}
                          </span>
                        ))}
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {/* Bottom How-to-Email Guide */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
          <Card className="p-5 border bg-card">
            <div className="flex items-center gap-2.5 font-semibold text-base mb-2">
              <ShieldCheck className="size-5 text-primary" />
              <span>How Inbound Emails Are Handled</span>
            </div>
            <ul className="space-y-2 text-xs sm:text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span>
                  <strong>Instant Acknowledgment:</strong> Every email gets an
                  immediate reply confirming delivery.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span>
                  <strong>AI Troubleshooting:</strong> Known policy and setup
                  questions receive an automated solution within seconds.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span>
                  <strong>Agent Hand-Off:</strong> Complex bugs or refunds
                  route straight to human support agents.
                </span>
              </li>
            </ul>
          </Card>

          <Card className="p-5 border bg-card">
            <div className="flex items-center gap-2.5 font-semibold text-base mb-2">
              <Mail className="size-5 text-primary" />
              <span>Drafting Fast Resolution Emails</span>
            </div>
            <ul className="space-y-2 text-xs sm:text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span>
                  <strong>Subject Line:</strong> Use a concise title like{" "}
                  <em>"Forgot password"</em> or <em>"Refund request"</em>.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span>
                  <strong>Account Details:</strong> Include your registered
                  purchase email and receipt ID for billing questions.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span>
                  <strong>Error Messages:</strong> Include specific error text
                  or screenshots when troubleshooting technical bugs.
                </span>
              </li>
            </ul>
          </Card>
        </div>
      </main>
    </div>
  );
}
