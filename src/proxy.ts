import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth"];

/**
 * Refreshes the Supabase session cookie on every request and sends signed-out
 * visitors to /login. Data access itself is protected by Row Level Security,
 * so this is a convenience gate, not the security boundary.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const path = request.nextUrl.pathname;

  // Supabase falls back to the Site URL root (/?code=…) when the requested redirect isn't on its
  // allow-list. Hand such codes to the callback so the sign-in still completes.
  const strayCode = request.nextUrl.searchParams.get("code");
  if (strayCode && !path.startsWith("/auth/")) {
    const cb = request.nextUrl.clone();
    cb.pathname = "/auth/callback";
    cb.search = "";
    cb.searchParams.set("code", strayCode);
    cb.searchParams.set("next", path === "/login" ? "/" : path);
    return NextResponse.redirect(cb);
  }

  let response = NextResponse.next({ request });
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!signedIn && !isPublic) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = path === "/" ? "" : `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(login);
  }
  if (signedIn && path === "/login") {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return NextResponse.redirect(home);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
