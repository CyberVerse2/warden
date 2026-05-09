import { NextResponse } from "next/server";

const PRIVY_COOKIES = ["privy-token", "privy-id-token", "privy:token"];

export async function POST(req: Request) {
  const url = new URL(req.url);
  url.pathname = "/login";
  url.search = "";
  const res = NextResponse.redirect(url, { status: 303 });
  for (const name of PRIVY_COOKIES) {
    res.cookies.set(name, "", { maxAge: 0, path: "/" });
  }
  return res;
}

export const GET = POST;
