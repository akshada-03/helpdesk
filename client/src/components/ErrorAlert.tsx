import axios from "axios";
import { AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";

type ErrorAlertProps = {
  // Static message, e.g. <ErrorAlert message="Failed to load data" />
  message?: string;
  // Or a thrown error (Axios/query/mutation) with automatic message extraction:
  // <ErrorAlert error={mutation.error} fallback="Failed to save" />
  error?: unknown;
  fallback?: string;
  className?: string;
};

function extractMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
    ) {
      return (data as { error: string }).error;
    }
    return error.message || fallback;
  }
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message || fallback;
  }
  return fallback;
}

export default function ErrorAlert({
  message,
  error,
  fallback = "Something went wrong",
  className,
}: ErrorAlertProps) {
  const text = message ?? extractMessage(error, fallback);

  return (
    <div
      role="alert"
      className={cn(
        "border-destructive/50 text-destructive flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
        className,
      )}
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span>{text}</span>
    </div>
  );
}
