import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { createUserSchema, updateUserSchema } from "core/schemas/users.ts";
import type { UserListItem } from "core/schemas/users.ts";
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

// Create and update share the same three fields, so one value shape covers both
// (the update schema's password is `"" | string`, which is still a string).
type UserFormValues = { name: string; email: string; password: string };

function emptyValues(): UserFormValues {
  return { name: "", email: "", password: "" };
}

function valuesFor(user: UserListItem): UserFormValues {
  // Password starts blank in edit mode — filling it resets the password, leaving
  // it blank keeps the current one.
  return { name: user.name, email: user.email, password: "" };
}

type UserFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // When provided, the dialog edits that user; otherwise it creates a new one.
  user?: UserListItem;
};

// A single controlled dialog backing both the "create user" and "edit user"
// flows. The mode is derived from the `user` prop so the form is defined once.
export default function UserFormDialog({
  open,
  onOpenChange,
  user,
}: UserFormDialogProps) {
  const isEdit = user !== undefined;
  const queryClient = useQueryClient();

  // Chrome treats an email+password pair as a login form and autofills the
  // admin's own saved credentials, ignoring autocomplete="off". Keeping the
  // fields readonly until the user focuses them defeats that: the browser skips
  // autofill on load, and the lock clears the moment a real user interacts.
  const [autofillLocked, setAutofillLocked] = useState(true);
  const noAutofill = {
    readOnly: autofillLocked,
    onFocus: () => setAutofillLocked(false),
  };

  const form = useForm<UserFormValues>({
    resolver: zodResolver(isEdit ? updateUserSchema : createUserSchema),
    // Validate a field once it's been blurred, then live as the user corrects it.
    mode: "onTouched",
    defaultValues: user ? valuesFor(user) : emptyValues(),
  });

  const saveUser = useMutation({
    mutationFn: (values: UserFormValues) =>
      isEdit
        ? api.patch(`/api/users/${user.id}`, values)
        : api.post("/api/users", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      onOpenChange(false);
    },
  });

  // Every time the dialog opens (or switches to a different user), start from a
  // clean, correctly-populated form with no stale error and the autofill lock
  // re-armed.
  useEffect(() => {
    if (!open) return;
    form.reset(user ? valuesFor(user) : emptyValues());
    saveUser.reset();
    setAutofillLocked(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit user" : "New user"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this user's details. Leave the password blank to keep it unchanged."
              : "Create a user account. They'll be added as an agent."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => saveUser.mutate(values))}
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
                  <FormLabel>{isEdit ? "New password" : "Password"}</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      {...field}
                      {...noAutofill}
                    />
                  </FormControl>
                  {isEdit && (
                    <p className="text-muted-foreground text-xs">
                      Leave blank to keep the current password.
                    </p>
                  )}
                  <ErrorMessage message={fieldState.error?.message} />
                </FormItem>
              )}
            />

            {saveUser.isError && (
              <ErrorAlert
                error={saveUser.error}
                fallback={isEdit ? "Failed to save changes" : "Failed to create user"}
              />
            )}

            <DialogFooter>
              <Button type="submit" disabled={saveUser.isPending}>
                {saveUser.isPending && <Loader2 className="animate-spin" />}
                {isEdit ? "Save changes" : "Create user"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
