import "server-only";
import { PrivyClient, type LinkedAccount, type User as PrivyUser } from "@privy-io/node";
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
  return new PrivyClient({
    appId: requireEnv("NEXT_PUBLIC_PRIVY_APP_ID"),
    appSecret: requireEnv("PRIVY_APP_SECRET"),
  });
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
  const email = normalizeEmail(input.email);
  await db
    .insert(users)
    .values({
      id: input.id,
      email,
      ...(input.name ? { name: input.name } : {}),
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email,
        name: input.name ?? null,
      },
    });
  return {
    ...input,
    email,
  };
}

function firstPresent(...values: Array<string | null | undefined>) {
  return values.find((v) => v && v.trim().length > 0)?.trim();
}

function normalizeEmail(value: string | null | undefined) {
  const email = firstPresent(value)?.toLowerCase();
  return email ?? null;
}

function shortIdentity(value: string) {
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-4)}`;
}

function accountOfType<T extends LinkedAccount["type"]>(
  linkedAccounts: LinkedAccount[],
  type: T,
) {
  return linkedAccounts.find(
    (account): account is Extract<LinkedAccount, { type: T }> => account.type === type,
  );
}

function walletAccount(linkedAccounts: LinkedAccount[]) {
  return linkedAccounts.find(
    (account): account is Extract<LinkedAccount, { type: "wallet" }> =>
      account.type === "wallet",
  );
}

function getProfileFromPrivyUser(privyUser: PrivyUser) {
  const emailAccount = accountOfType(privyUser.linked_accounts, "email");
  const google = accountOfType(privyUser.linked_accounts, "google_oauth");
  const github = accountOfType(privyUser.linked_accounts, "github_oauth");
  const discord = accountOfType(privyUser.linked_accounts, "discord_oauth");
  const apple = accountOfType(privyUser.linked_accounts, "apple_oauth");
  const linkedin = accountOfType(privyUser.linked_accounts, "linkedin_oauth");
  const spotify = accountOfType(privyUser.linked_accounts, "spotify_oauth");
  const farcaster = accountOfType(privyUser.linked_accounts, "farcaster");
  const twitter = accountOfType(privyUser.linked_accounts, "twitter_oauth");
  const telegram = accountOfType(privyUser.linked_accounts, "telegram");
  const instagram = accountOfType(privyUser.linked_accounts, "instagram_oauth");
  const tiktok = accountOfType(privyUser.linked_accounts, "tiktok_oauth");
  const wallet = walletAccount(privyUser.linked_accounts);

  const email = firstPresent(
    emailAccount?.address,
    google?.email,
    github?.email,
    discord?.email,
    apple?.email,
    linkedin?.email,
    spotify?.email,
  );
  const username = firstPresent(
    farcaster?.username,
    twitter?.username,
    github?.username,
    discord?.username,
    telegram?.username,
    instagram?.username,
    tiktok?.username,
    email?.split("@")[0],
    wallet?.address ? shortIdentity(wallet.address) : undefined,
    shortIdentity(privyUser.id.replace(/^did:privy:/, "")),
  );
  const name = firstPresent(
    farcaster?.display_name,
    twitter?.name,
    google?.name,
    github?.name,
    linkedin?.name,
    [telegram?.first_name, telegram?.last_name].filter(Boolean).join(" "),
    username,
  );
  const avatarUrl = firstPresent(
    farcaster?.profile_picture_url,
    farcaster?.profile_picture,
    twitter?.profile_picture_url,
    telegram?.photo_url,
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
    try {
      const claims = await client.utils().auth().verifyAccessToken(token);
      const privyUser = await client.users()._get(claims.user_id);
      return upsertUser({
        id: claims.user_id,
        ...getProfileFromPrivyUser(privyUser),
      });
    } catch (error) {
      console.error("Privy session verification failed", error);
      redirect("/login?auth=expired");
    }
  }

  redirect("/login");
}
