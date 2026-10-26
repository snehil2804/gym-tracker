"use client";

import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Field, Input, Segmented, friendlyError } from "@/components/ui";
import { getSupabase } from "@/lib/supabase/client";
import { ALLOW_SIGNUP } from "@/lib/supabase/env";

type Mode = "signin" | "signup" | "reset";

export function LoginForm() {
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error"));
  const [notice, setNotice] = useState<string | null>(null);

  const next = (() => {
    const n = params.get("next");
    return n && n.startsWith("/") && !n.startsWith("//") ? n : "/";
  })();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const sb = getSupabase();
    const redirect = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    try {
      if (mode === "signin") {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        window.location.href = next;
        return;
      }
      if (mode === "signup") {
        if (password.length < 8) throw new Error("Use at least 8 characters for your password.");
        const { data, error } = await sb.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirect } });
        if (error) throw error;
        if (data.session) {
          window.location.href = next;
          return;
        }
        setNotice("Check your inbox to confirm your email, then sign in here.");
        setMode("signin");
      }
      if (mode === "reset") {
        const { error } = await sb.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/auth/callback?next=/settings%23account`,
        });
        if (error) throw error;
        setNotice("If that email has an account, a reset link is on its way.");
      }
    } catch (err) {
      const msg = friendlyError(err);
      setError(/Invalid login credentials/i.test(msg) ? "That email and password don't match." : /Email not confirmed/i.test(msg) ? "Confirm your email first — check your inbox for the link." : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        {mode === "signup" ? "Create your account" : mode === "reset" ? "Reset password" : "Welcome back"}
      </h1>
      <p className="mt-2 text-sm text-muted">
        {mode === "reset" ? "We'll email you a link to set a new password." : "Your gym, PT and workout records — private to you."}
      </p>

      {ALLOW_SIGNUP && mode !== "reset" && (
        <Segmented
          className="mt-6"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError(null);
          }}
          options={[
            { value: "signin", label: "Sign in" },
            { value: "signup", label: "Sign up" },
          ]}
          ariaLabel="Account"
        />
      )}

      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {mode !== "reset" && (
          <Field label="Password" htmlFor="password" hint={mode === "signup" ? "At least 8 characters." : undefined}>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              minLength={mode === "signup" ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent">
            {error}
          </p>
        )}
        {notice && <p className="rounded-xl bg-good-soft px-3 py-2 text-sm text-good">{notice}</p>}
        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          {mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}
        </Button>
      </form>

      <div className="mt-5 text-center text-sm">
        {mode === "reset" ? (
          <button className="text-muted underline-offset-2 hover:text-ink hover:underline" onClick={() => setMode("signin")}>
            Back to sign in
          </button>
        ) : (
          <button className="text-muted underline-offset-2 hover:text-ink hover:underline" onClick={() => setMode("reset")}>
            Forgot password?
          </button>
        )}
      </div>
    </div>
  );
}
