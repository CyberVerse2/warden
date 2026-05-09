import "server-only";
import { PrivyClient, type User as PrivyUser } from "@privy-io/server-auth";
import { users } from "@warden/db";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "./db";
import { requireEnv } from "./env";

export interface CurrentUser {
  id: string;
  email: string | null;
  name?: string;
  username?: string;
  avatarUrl?: string;
}

function getPrivyClient() {
  return new PrivyClient(
    requireEnv("NEXT_PUBLIC_PRIVY_APP_ID"),
    requireEnv("PRIVY_APP_SECRET"),
  );
}

async function readPrivyToken() {
  const cookieStore = await cookies();
  return (
    cookieStore.get("privy-token")?.value ??
    cookieStore.get("privy-id-token")?.value ??
    cookieStore.get("privy:token")?.value ??
    (await headers()).get("authorization")?.replace(/^Bearer\s+/i, "")
  );
}

async function upsertUser(input: CurrentUser): Promise<CurrentUser> {
  const db = getDb();
  await db
    .insert(users)
    .values({
      id: input.id,
      email: input.email,
      ...(input.name ? { name: input.name } : {}),
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email: input.email,
        name: input.name ?? null,
      },
    });
  return input;
}

function firstPresent(...values: Array<string | null | undefined>) {
  return values.find((v) => v && v.trim().length > 0)?.trim();
}

function shortIdentity(value: string) {
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-4)}`;
}

function getProfileFromPrivyUser(privyUser: PrivyUser) {
  const email = firstPresent(
    privyUser.email?.address,
    privyUser.google?.email,
    privyUser.github?.email,
    privyUser.discord?.email,
    privyUser.apple?.email,
    privyUser.linkedin?.email,
    privyUser.spotify?.email,
  );
  const username = firstPresent(
    privyUser.farcaster?.username,
    privyUser.twitter?.username,
    privyUser.github?.username,
    privyUser.discord?.username,
    privyUser.telegram?.username,
    privyUser.instagram?.username,
    privyUser.tiktok?.username,
    email?.split("@")[0],
    privyUser.wallet?.address ? shortIdentity(privyUser.wallet.address) : undefined,
    shortIdentity(privyUser.id.replace(/^did:privy:/, "")),
  );
  const name = firstPresent(
    privyUser.farcaster?.displayName,
    privyUser.twitter?.name,
    privyUser.google?.name,
    privyUser.github?.name,
    privyUser.linkedin?.name,
    [privyUser.telegram?.firstName, privyUser.telegram?.lastName]
      .filter(Boolean)
      .join(" "),
    username,
  );
  const avatarUrl = firstPresent(
    privyUser.farcaster?.pfp,
    privyUser.twitter?.profilePictureUrl,
    privyUser.telegram?.photoUrl,
  );

  return {
    email: email ?? null,
    ...(name ? { name } : {}),
    ...(username ? { username } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const client = getPrivyClient();
  const token = await readPrivyToken();

  if (token) {
    const claims = await client.verifyAuthToken(token);
    const privyUser = await client.getUser(claims.userId);
    return upsertUser({
      id: claims.userId,
      ...getProfileFromPrivyUser(privyUser),
    });
  }

  redirect("/login");
}
