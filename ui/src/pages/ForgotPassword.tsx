import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { authApi } from "../api/auth";
import { Button } from "@/components/ui/button";
import { AsciiArtAnimation } from "@/components/AsciiArtAnimation";
import { Sparkles } from "lucide-react";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      await authApi.requestPasswordReset({
        email: email.trim(),
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
    },
    onSuccess: () => setError(null),
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Could not send the reset email.");
    },
  });

  const canSubmit = email.trim().length > 0;
  const submitted = mutation.isSuccess;

  return (
    <div className="fixed inset-0 flex bg-background">
      <div className="w-full md:w-1/2 flex flex-col overflow-y-auto">
        <div className="w-full max-w-md mx-auto my-auto px-8 py-12">
          <div className="flex items-center gap-2 mb-8">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Paperclip</span>
          </div>

          <h1 className="text-xl font-semibold">Forgot your password?</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your account email and we'll send you a link to choose a new password.
          </p>

          {submitted ? (
            <div className="mt-6 space-y-4">
              <p className="rounded-md border border-border bg-muted/40 px-3 py-3 text-sm text-foreground">
                If <span className="font-medium">{email.trim()}</span> is registered, a password reset link is on its
                way. Check your inbox (and spam folder).
              </p>
              <Link to="/auth" className="text-sm font-medium text-foreground underline underline-offset-2">
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <form
                className="mt-6 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (mutation.isPending) return;
                  if (!canSubmit) {
                    setError("Please enter your email.");
                    return;
                  }
                  mutation.mutate();
                }}
              >
                <div>
                  <label htmlFor="email" className="text-xs text-muted-foreground mb-1 block">
                    Email
                  </label>
                  <input
                    id="email"
                    name="email"
                    className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    autoFocus
                  />
                </div>
                {error && <p className="text-xs text-destructive">{error}</p>}
                <Button
                  type="submit"
                  disabled={mutation.isPending}
                  aria-disabled={!canSubmit || mutation.isPending}
                  className={`w-full ${!canSubmit && !mutation.isPending ? "opacity-50" : ""}`}
                >
                  {mutation.isPending ? "Sending…" : "Send reset link"}
                </Button>
              </form>

              <div className="mt-5 text-sm text-muted-foreground">
                Remembered it?{" "}
                <Link to="/auth" className="font-medium text-foreground underline underline-offset-2">
                  Sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="hidden md:block w-1/2 overflow-hidden">
        <AsciiArtAnimation />
      </div>
    </div>
  );
}
