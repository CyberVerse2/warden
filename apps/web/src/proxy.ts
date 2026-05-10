import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/api/health",
  "/auth/signout",
  // Chat streams handle auth inside the route so failures can be returned as SSE
  // instead of a login HTML page that leaves the client waiting for events.
  "/api/agent-chat",
  // MCP endpoint authenticates via Bearer token, not Privy cookie.
  "/api/mcp",
];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    pathname === "/" ||
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const hasPrivySession =
    req.cookies.has("privy-token") ||
    req.cookies.has("privy-id-token") ||
    req.cookies.has("privy:token");

  if (!hasPrivySession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
