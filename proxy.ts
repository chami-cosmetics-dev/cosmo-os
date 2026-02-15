import type { NextRequest } from "next/server";

import { auth0 } from "./lib/auth0";

export async function proxy(request: NextRequest) {
  const response = await auth0.middleware(request);

  // Public routes - no auth required
  if (
    request.nextUrl.pathname === "/login" ||
    request.nextUrl.pathname.startsWith("/invite/") ||
    request.nextUrl.pathname.startsWith("/auth/") ||
    request.nextUrl.pathname.startsWith("/api/webhooks/")
  ) {
    return response;
  }

  // Protect dashboard routes - redirect to login if not authenticated
  if (request.nextUrl.pathname.startsWith("/dashboard")) {
    const session = await auth0.getSession(request);
    if (!session) {
      return Response.redirect(new URL("/login", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
