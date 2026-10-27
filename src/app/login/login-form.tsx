"use client";

import { LiftLogo } from "@/components/logo";
import { ChevronDown, Mail } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button, Field, Input, Segmented, friendlyError } from "@/components/ui";
import { getSupabase } from "@/lib/supabase/client";
import { ALLOW_SIGNUP, SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/env";

type Mode = "signin" | "signup" | "reset";

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function readableAuthError(raw: string): string {
  if (/provider is not enabled|Unsupported provider/i.test(raw)) return "Google sign-in isn't switched on yet. Use email for now.";
  if (/Invalid login credentials/i.test(raw)) return "That email and password don't match.";
  if (/Email not confirmed/i.test(raw)) return "Confirm your email first — check your inbox for the link.";
  if (/access_denied|cancel/i.test(raw)) return "Google sign-in was cancelled.";
  if (/code verifier|flow state|invalid.*code|expired/i.test(raw))
    return "That sign-in link expired or was opened on a different site or browser. Tap Continue with Google again.";
  return raw;
}

export function LoginForm() {
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>("signin");
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<null | "google" | "email">(null);
  const [error, setError] = useState<string | null>(() => {
    const e = params.get("error");
    return e ? readableAuthError(e) : null;
  });
  const [notice, setNotice] = useState<string | null>(() =>
    params.get("deleted") ? "Your account and all of its data have been deleted." : null,
  );
  // null = unknown (settings not loaded); true/false = whether Google is enabled in Supabase.
  const [googleEnabled, setGoogleEnabled] = useState<boolean | null>(null);

  const next = (() => {
    const n = params.get("next");
    return n && n.startsWith("/") && !n.startsWith("//") ? n : "/";
  })();

  useEffect(() => {
    let cancelled = false;
    fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY } })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { external?: { google?: boolean } } | null) => {
        if (cancelled || !s) return;
        const on = Boolean(s.external?.google);
        setGoogleEnabled(on);
        if (!on) setShowEmail(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function signInWithGoogle() {
    setBusy("google");
    setError(null);
    const { error } = await getSupabase().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        queryParams: { prompt: "select_account" },
      },
    });
    // On success the browser is already navigating to Google.
    if (error) {
      setError(readableAuthError(error.message));
      setBusy(null);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy("email");
    setError(null);
    setNotice(null);
    const sb = getSupabase();
    const redirect = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    try {
      if (mode === "signin") {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        window.location.replace(next);
        return;
      }
      if (mode === "signup") {
        if (password.length < 8) throw new Error("Use at least 8 characters for your password.");
        const { data, error } = await sb.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirect } });
        if (error) throw error;
        if (data.session) {
          window.location.replace(next);
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
      setError(readableAuthError(friendlyError(err)));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 flex items-center gap-3 lg:hidden">
        <LiftLogo size={44} className="shadow-brand" />
        <span className="font-display text-xl font-semibold tracking-tight">Rep Ledger</span>
      </div>
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        {mode === "reset" ? "Reset password" : "Welcome back"}
      </h1>
      <p className="mt-2 text-sm text-muted">
        {mode === "reset" ? "We'll email you a link to set a new password." : "Your gym, PT and workout records — private to you."}
      </p>

      {mode !== "reset" && (
        <>
          <Button
            variant="primary"
            size="lg"
            block
            className="mt-8"
            loading={busy === "google"}
            disabled={googleEnabled === false || busy === "email"}
            onClick={signInWithGoogle}
            icon={
              busy === "google" ? undefined : (
                <span className="grid size-6 place-items-center rounded-full bg-white">
                  <GoogleLogo />
                </span>
              )
            }
          >
            Continue with Google
          </Button>
          {googleEnabled === false && (
            <p className="mt-2 text-xs text-muted">Google sign-in isn&apos;t switched on for this app yet. Use your email below.</p>
          )}

          <div className="my-6 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
          </div>

          {!showEmail && (
            <Button variant="secondary" block icon={<Mail className="size-4" />} onClick={() => setShowEmail(true)}>
              Use email and password <ChevronDown className="size-4" />
            </Button>
          )}
        </>
      )}

      {(showEmail || mode === "reset") && (
        <div className="anim-rise">
          {ALLOW_SIGNUP && mode !== "reset" && (
            <Segmented
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
          <form onSubmit={submit} className="mt-4 space-y-4">
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
            <Button type="submit" variant={googleEnabled === false || mode === "reset" ? "primary" : "secondary"} size="lg" block loading={busy === "email"} disabled={busy === "google"}>
              {mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in with email"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
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
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent">
          {error}
        </p>
      )}
      {notice && <p className="mt-4 rounded-xl bg-good-soft px-3 py-2 text-sm text-good">{notice}</p>}
    </div>
  );
}
