import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router-dom";
import { LifeBuoy, Loader2 } from "lucide-react";
import { z } from "zod/v4";

import { signIn, useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import FullPageSpinner from "@/components/FullPageSpinner";

const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginValues = z.infer<typeof loginSchema>;

export default function Login() {
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    // Validate a field once it's been blurred, then live as the user corrects
    // it — so an invalid email shows its error without waiting for submit.
    mode: "onTouched",
    defaultValues: { email: "", password: "" },
  });

  const loginMutation = useMutation({
    mutationFn: async (values: LoginValues) => {
      const { error } = await signIn.email({
        email: values.email,
        password: values.password,
      });
      if (error) {
        throw new Error(error.message || "Invalid email or password");
      }
    },
    onSuccess: () => navigate("/", { replace: true }),
  });

  // Already signed in — skip the login page.
  if (isPending) return <FullPageSpinner />;
  if (session) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg tracking-[-0.014em]">
            <LifeBuoy className="text-primary size-5 shrink-0" aria-hidden />
            Sign in to Helpdesk
          </CardTitle>
          <CardDescription>
            Accounts are created by an admin. Ask yours if you need access.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((values) =>
                loginMutation.mutate(values),
              )}
              className="grid gap-4"
              noValidate
            >
              <FormField
                control={form.control}
                name="email"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        {...field}
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
                        autoComplete="current-password"
                        {...field}
                      />
                    </FormControl>
                    <ErrorMessage message={fieldState.error?.message} />
                  </FormItem>
                )}
              />

              {loginMutation.isError && (
                <ErrorAlert
                  error={loginMutation.error}
                  fallback="Unable to sign in"
                />
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending && <Loader2 className="animate-spin" />}
                Sign in
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
