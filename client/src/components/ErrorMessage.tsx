// Inline field-level validation error, e.g. under a form input:
//   {errors.email && <ErrorMessage message={errors.email.message} />}
export default function ErrorMessage({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-destructive text-sm">{message}</p>;
}
