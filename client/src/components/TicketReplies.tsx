import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import {
  createReplySchema,
  type CreateReplyInput,
  type TicketReply,
} from "core/schemas/tickets.ts";
import { api } from "@/lib/api";
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

  return (
    <div
      className={
        isAgent ? "space-y-1" : "bg-muted/50 space-y-1 rounded-md p-3"
      }
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Badge variant={isAgent ? "secondary" : "outline"}>
            {isAgent ? "Agent" : "Customer"}
          </Badge>
          {/* Agent replies name the authoring user (falling back to "Agent" only
              if that user was since hard-deleted). Customer replies have no
              app-User author, so the badge alone identifies them. */}
          {isAgent && <span>{reply.author?.name ?? "Agent"}</span>}
        </span>
        <span className="text-muted-foreground text-xs">
          {new Date(reply.createdAt).toLocaleString()}
        </span>
      </div>
      <p className="text-sm whitespace-pre-wrap">{reply.body}</p>
    </div>
  );
}

// The reply thread and compose form for a ticket, rendered below the inbound
// message on the detail page. Owns its own replies query (keyed on the ticket id)
// so it refreshes independently of the ticket detail.
export default function TicketReplies({ ticketId }: { ticketId: string }) {
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
      // Refetch the thread so it reflects the server's ordering and author
      // identity, then clear the compose box for the next reply.
      queryClient.invalidateQueries({ queryKey: ["ticket-replies", ticketId] });
      form.reset();
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Replies</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {replies.isPending ? (
          <div className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : replies.isError ? (
          <ErrorAlert error={replies.error} fallback="Failed to load replies." />
        ) : replies.data.length === 0 ? (
          <p className="text-muted-foreground text-sm">No replies yet.</p>
        ) : (
          <div className="divide-y">
            {replies.data.map((reply) => (
              <div key={reply.id} className="py-3 first:pt-0 last:pb-0">
                <ReplyItem reply={reply} />
              </div>
            ))}
          </div>
        )}

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => sendReply.mutate(values))}
            className="space-y-3"
            noValidate
          >
            <FormField
              control={form.control}
              name="body"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormControl>
                    <Textarea
                      placeholder="Write a reply…"
                      rows={4}
                      aria-label="Reply message"
                      {...field}
                    />
                  </FormControl>
                  <ErrorMessage message={fieldState.error?.message} />
                </FormItem>
              )}
            />

            {sendReply.isError && (
              <ErrorAlert
                error={sendReply.error}
                fallback="Failed to send reply."
              />
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={sendReply.isPending}>
                {sendReply.isPending && <Loader2 className="animate-spin" />}
                Send reply
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
