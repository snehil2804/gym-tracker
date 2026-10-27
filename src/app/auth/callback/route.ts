import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabase/server";

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

/** Completes Google sign-in (OAuth PKCE), email confirmation and password-reset links. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const supabase = await getServerSupabase();

  let error: string | null = null;
  const providerError = searchParams.get("error_description") ?? searchParams.get("error");
  if (providerError) {
    error = providerError;
  } else if (code) {
    const res = await supabase.auth.exchangeCodeForSession(code);
    error = res.error?.message ?? null;
  } else if (tokenHash && type) {
    const res = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    error = res.error?.message ?? null;
  } else {
    error = "The sign-in link is incomplete.";
  }

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error)}`);
  }
  return NextResponse.redirect(`${origin}${next}`);
}
