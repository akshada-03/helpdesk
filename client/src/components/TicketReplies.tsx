import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";

import {
  createReplySchema,
  type CreateReplyInput,
  type PolishReplyResponse,
  type TicketReply,
} from "core/schemas/tickets.ts";
import { api } from "@/lib/api";
import { sanitizeHtml } from "@/lib/sanitize";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";

// A single reply in the thread — sender, timestamp, and the message body. Agent
// and customer replies are labelled with a badge and offset (customer replies get
// a muted panel) so the two sides of the conversation are easy to tell apart.
function ReplyItem({ reply }: { reply: TicketReply }) {
  const isAgent = reply.senderType === "agent";

  const cleanHtml = useMemo(
    () => (reply.bodyHtml ? sanitizeHtml(reply.bodyHtml) : null),
    [reply.bodyHtml],
  );

  return (
    <div
      className={
        isAgent
          ? "space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-4 shadow-2xs"
          : "space-y-2 rounded-xl border border-border/80 bg-card p-4 shadow-2xs"
      }
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Badge
            variant="outline"
            className={
              isAgent
                ? "u-chip bg-primary/10 border-primary/20 text-primary"
                : "u-chip bg-muted border-border text-muted-foreground"
            }
          >
            {isAgent ? "agent" : "customer"}
          </Badge>
          {isAgent && <span className="font-semibold text-foreground">{reply.author?.name ?? "Agent"}</span>}
        </span>
        <span className="text-muted-foreground u-data text-xs">
          {new Date(reply.createdAt).toLocaleString()}
        </span>
      </div>
      {cleanHtml !== null ? (
        <div
          className="prose dark:prose-invert max-w-none text-sm leading-relaxed [&_a]:text-primary [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: cleanHtml }}
        />
      ) : (
        <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">{reply.body}</p>
      )}
    </div>
  );
}

export default function TicketReplies({ ticketId }: { ticketId: number }) {
  const queryClient = useQueryClient();

  const replies = useQuery({
    queryKey: ["ticket-replies", ticketId],
    queryFn: async () =>
      (await api.get<TicketReply[]>(`/api/tickets/${ticketId}/replies`)).data,
  });

  const form = useForm<CreateReplyInput>({
    resolver: zodResolver(createReplySchema),
    defaultValues: { body: "" },
  });

  const sendReply = useMutation({
    mutationFn: async (values: CreateReplyInput) =>
      (await api.post<TicketReply>(`/api/tickets/${ticketId}/replies`, values))
        .data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-replies", ticketId] });
      form.reset();
    },
  });

  const polishReply = useMutation({
    mutationFn: async (body: string) =>
      (
        await api.post<PolishReplyResponse>(
          `/api/tickets/${ticketId}/replies/polish`,
          { body },
        )
      ).data,
    onSuccess: (data) => {
      form.setValue("body", data.body, {
        shouldDirty: true,
        shouldValidate: true,
      });
    },
  });

  const draft = form.watch("body");
  const isEmpty = draft.trim() === "";
  const busy = polishReply.isPending || sendReply.isPending;

  return (
    <Card className="border-border/80 shadow-xs overflow-hidden">
      <CardHeader className="border-b bg-muted/10 pb-4">
        <CardTitle className="u-label text-xs uppercase tracking-wider font-semibold text-muted-foreground">
          Conversation Thread & Replies
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        {replies.isPending ? (
          <div className="space-y-4">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ) : replies.isError ? (
          <ErrorAlert error={replies.error} fallback="Failed to load replies." />
        ) : replies.data.length === 0 ? (
          <p className="text-muted-foreground text-sm font-medium">No replies yet.</p>
        ) : (
          <div className="space-y-3">
            {replies.data.map((reply) => (
              <ReplyItem key={reply.id} reply={reply} />
            ))}
          </div>
        )}

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => sendReply.mutate(values))}
            className="space-y-3 rounded-xl border border-border/80 bg-muted/10 p-4"
            noValidate
          >
            <FormField
              control={form.control}
              name="body"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormControl>
                    <Textarea
                      placeholder="Type your response to the customer…"
                      rows={4}
                      aria-label="Reply message"
                      className="bg-background text-sm leading-relaxed"
                      {...field}
                    />
                  </FormControl>
                  <ErrorMessage message={fieldState.error?.message} />
                </FormItem>
              )}
            />

            {polishReply.isError && (
              <ErrorAlert
                error={polishReply.error}
                fallback="Failed to polish the reply."
              />
            )}

            {sendReply.isError && (
              <ErrorAlert
                error={sendReply.error}
                fallback="Failed to send reply."
              />
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-xs text-muted-foreground hidden sm:inline">
                Polishing uses AI to clean up grammar and tone before sending.
              </span>
              <div className="flex items-center gap-2 ml-auto">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-primary/30 text-primary hover:bg-primary/10"
                  disabled={busy || isEmpty}
                  onClick={() => polishReply.mutate(draft)}
                >
                  {polishReply.isPending ? (
                    <Loader2 className="animate-spin size-4" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  Polish
                </Button>
                <Button type="submit" size="sm" disabled={busy || isEmpty}>
                  {sendReply.isPending && <Loader2 className="animate-spin size-4" />}
                  Send reply
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
