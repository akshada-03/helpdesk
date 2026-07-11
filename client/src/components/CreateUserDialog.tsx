import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";

import { createUserSchema, type CreateUserInput } from "core/schemas/users.ts";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";

export default function CreateUserDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  // Chrome treats an email+password pair as a login form and autofills the
  // admin's own saved credentials, ignoring autocomplete="off". Keeping the
  // fields readonly until the user focuses them defeats that: the browser skips
  // autofill on load, and the lock clears the moment a real user interacts.
  // (Held in state, not via DOM mutation, so re-renders don't re-lock while
  // typing.) Re-locked whenever the dialog closes so a reopen is protected too.
  const [autofillLocked, setAutofillLocked] = useState(true);
  const noAutofill = {
    readOnly: autofillLocked,
    onFocus: () => setAutofillLocked(false),
  };

  const form = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    // Validate a field once it's been blurred, then live as the user corrects it.
    mode: "onTouched",
    defaultValues: { name: "", email: "", password: "" },
  });

  const createUser = useMutation({
    mutationFn: (values: CreateUserInput) => api.post("/api/users", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      form.reset();
      setOpen(false);
    },
  });

  // Reset the form and any mutation error whenever the dialog is closed.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      form.reset();
      createUser.reset();
      setAutofillLocked(true);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        New user
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New user</DialogTitle>
            <DialogDescription>
              Create a user account. They'll be added as an agent.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((values) => createUser.mutate(values))}
              className="grid gap-4"
              autoComplete="off"
              noValidate
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Jane Doe" {...field} {...noAutofill} />
                    </FormControl>
                    <ErrorMessage message={fieldState.error?.message} />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="off"
                        placeholder="jane@example.com"
                        {...field}
                        {...noAutofill}
                      />
                    </FormControl>
                    <ErrorMessage message={fieldState.error?.message} />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="new-password"
                        {...field}
                        {...noAutofill}
                      />
                    </FormControl>
                    <ErrorMessage message={fieldState.error?.message} />
                  </FormItem>
                )}
              />

              {createUser.isError && (
                <ErrorAlert
                  error={createUser.error}
                  fallback="Failed to create user"
                />
              )}

              <DialogFooter>
                <Button type="submit" disabled={createUser.isPending}>
                  {createUser.isPending && <Loader2 className="animate-spin" />}
                  Create user
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
