import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { BookOpen, LifeBuoy, Loader2 } from "lucide-react";
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
import ThemeToggle from "@/components/ThemeToggle";

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
    <div className="relative flex min-h-svh flex-col items-center justify-center bg-background p-4 sm:p-6">
      {/* Background ambient lighting */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -z-10 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl" />
      </div>

      {/* Top right theme toggle */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-sm border-border/80 shadow-lg backdrop-blur-sm">
        <CardHeader className="space-y-3 text-center pb-2">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-xs">
            <LifeBuoy className="size-6" aria-hidden />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-xl font-bold tracking-tight">
              Sign in to Helpdesk
            </CardTitle>
            <CardDescription className="text-xs">
              Enter your credentials to access your support workspace
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
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
                        className="bg-background"
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
                        className="bg-background"
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
                className="mt-1 w-full font-semibold shadow-sm"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending && <Loader2 className="animate-spin size-4" />}
                Sign in
              </Button>
            </form>
          </Form>

          <div className="mt-6 border-t pt-4 text-center">
            <Link
              to="/knowledge-base"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors font-medium"
            >
              <BookOpen className="size-3.5" />
              <span>Looking for help? View Support Knowledge Base & Guidelines</span>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
