import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { readDisplayName } from "@/lib/auth/display-name";

// Routes reachable while signed out. Everything else requires a session.
const PUBLIC_PATHS = ["/login", "/auth/callback"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

/**
 * Refreshes the Supabase auth cookies on every request and enforces
 * route protection. Uses `getClaims()` (verifies the JWT) rather than
 * `getSession()`, which must not be trusted to secure protected routes.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: do not run code between createServerClient and getClaims().
  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = data?.claims != null;
  const hasName = isAuthenticated && readDisplayName(data?.claims?.user_metadata) !== null;

  const { pathname } = request.nextUrl;
  const isOnboarding = pathname === "/onboarding";

  // Signed out and visiting a protected route -> /login
  if (!isAuthenticated && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Signed in and visiting /login -> onward (onboarding first if not yet named)
  if (isAuthenticated && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = hasName ? "/" : "/onboarding";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Signed in but no display name yet -> one-time onboarding. Allowed to stay
  // on /onboarding itself, and never applied to public paths (e.g. callback).
  if (isAuthenticated && !hasName && !isOnboarding && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/onboarding";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Signed in and already named -> onboarding is done, send to the dashboard.
  if (isAuthenticated && hasName && isOnboarding) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
