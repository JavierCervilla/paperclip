import { useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "@/lib/router";
import { authApi } from "../api/auth";
import { Button } from "@/components/ui/button";
import { AsciiArtAnimation } from "@/components/AsciiArtAnimation";
import { Sparkles } from "lucide-react";

const MIN_PASSWORD_LENGTH = 8;

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  // Better Auth's link-verification step redirects here with ?error=INVALID_TOKEN
  // when the token is missing or expired.
  const linkError = searchParams.get("error");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Missing reset token.");
      await authApi.resetPassword({ token, newPassword: password });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Could not reset your password.");
    },
  });

  const tokenInvalid = !token || Boolean(linkError);

  const canSubmit = password.length >= MIN_PASSWORD_LENGTH && confirm.length > 0 && password === confirm;

  const shell = (children: ReactNode) => (
    <div className="fixed inset-0 flex bg-background">
      <div className="w-full md:w-1/2 flex flex-col overflow-y-auto">
        <div className="w-full max-w-md mx-auto my-auto px-8 py-12">
          <div className="flex items-center gap-2 mb-8">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Paperclip</span>
          </div>
          {children}
        </div>
      </div>
      <div className="hidden md:block w-1/2 overflow-hidden">
        <AsciiArtAnimation />
      </div>
    </div>
  );

  if (tokenInvalid) {
    return shell(
      <>
        <h1 className="text-xl font-semibold">Reset link invalid</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This password reset link is missing, invalid, or has expired. Request a new one to continue.
        </p>
        <div className="mt-6">
          <Link to="/auth/forgot-password">
            <Button className="w-full">Request a new reset link</Button>
          </Link>
        </div>
        <div className="mt-5 text-sm text-muted-foreground">
          <Link to="/auth" className="font-medium text-foreground underline underline-offset-2">
            Back to sign in
          </Link>
        </div>
      </>,
    );
  }

  if (mutation.isSuccess) {
    return shell(
      <>
        <h1 className="text-xl font-semibold">Password updated</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your password has been changed. You can now sign in with your new password.
        </p>
        <div className="mt-6">
          <Button className="w-full" onClick={() => navigate("/auth", { replace: true })}>
            Go to sign in
          </Button>
        </div>
      </>,
    );
  }

  return shell(
    <>
      <h1 className="text-xl font-semibold">Choose a new password</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Pick a password with at least {MIN_PASSWORD_LENGTH} characters.
      </p>

      <form
        className="mt-6 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (mutation.isPending) return;
          if (password.length < MIN_PASSWORD_LENGTH) {
            setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
            return;
          }
          if (password !== confirm) {
            setError("Passwords do not match.");
            return;
          }
          setError(null);
          mutation.mutate();
        }}
      >
        <div>
          <label htmlFor="password" className="text-xs text-muted-foreground mb-1 block">
            New password
          </label>
          <input
            id="password"
            name="password"
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            autoFocus
          />
        </div>
        <div>
          <label htmlFor="confirm" className="text-xs text-muted-foreground mb-1 block">
            Confirm new password
          </label>
          <input
            id="confirm"
            name="confirm"
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
          />
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button
          type="submit"
          disabled={mutation.isPending}
          aria-disabled={!canSubmit || mutation.isPending}
          className={`w-full ${!canSubmit && !mutation.isPending ? "opacity-50" : ""}`}
        >
          {mutation.isPending ? "Updating…" : "Update password"}
        </Button>
      </form>

      <div className="mt-5 text-sm text-muted-foreground">
        <Link to="/auth" className="font-medium text-foreground underline underline-offset-2">
          Back to sign in
        </Link>
      </div>
    </>,
  );
}
