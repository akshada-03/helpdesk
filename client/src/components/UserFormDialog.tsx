import { useEffect, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { Role } from "core/constants/role.ts";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";

// Create and update share the same fields, so one value shape covers both. Role
// starts empty (`""`) in create mode so the admin must actively pick one; the
// schema rejects `""` as "Please select a role".
type UserFormValues = {
  name: string;
  email: string;
  password: string;
  role: Role | "";
};

function emptyValues(): UserFormValues {
  return { name: "", email: "", password: "", role: "" };
}

function valuesFor(user: UserListItem): UserFormValues {
  // Password starts blank in edit mode — filling it resets the password, leaving
  // it blank keeps the current one. Role is pre-selected to the user's current role.
  return { name: user.name, email: user.email, password: "", role: user.role };
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
    // The schema's role output is `"admin" | "agent"`, but the form field allows
    // `""` (unselected) as input — cast to the field-values resolver shape.
    resolver: zodResolver(
      isEdit ? updateUserSchema : createUserSchema,
    ) as Resolver<UserFormValues>,
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
              : "Create a user account and choose their role."}
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
              name="role"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={Role.agent}>Agent</SelectItem>
                      <SelectItem value={Role.admin}>Admin</SelectItem>
                    </SelectContent>
                  </Select>
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
