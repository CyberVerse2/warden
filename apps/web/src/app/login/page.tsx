"use client";

import { PrivyProvider, useLogin, usePrivy } from "@privy-io/react-auth";
import { useSearchParams } from "next/navigation";

function LoginPanel() {
  const search = useSearchParams();
  const next = search.get("next") ?? "/dashboard";
  const { ready, authenticated } = usePrivy();
  const { login } = useLogin({
    onComplete: () => {
      window.location.href = next;
    },
  });

  return (
    <main className="min-h-screen bg-bg-base text-t1 flex items-center justify-center px-6">
      <section className="w-full max-w-[420px] border border-hairline-strong p-8">
        <span className="mono text-t4 text-[11px]">WARDEN · OPERATOR AUTH</span>
        <h1 className="mt-3 text-[28px] tracking-[-0.025em] font-medium">
          Sign in
        </h1>
        <p className="mt-2 text-t3 text-[13.5px] leading-relaxed">
          Privy owns operator identity. Warden keeps agent wallets custodial
          under its master key.
        </p>
        <button
          disabled={!ready}
          onClick={() => (authenticated ? (window.location.href = next) : login())}
          className="mt-6 w-full label px-4 py-3 border border-signal-dim text-signal hover:bg-signal hover:text-bg-base hover:border-signal disabled:opacity-50 transition-colors"
        >
          CONTINUE WITH PRIVY
        </button>
      </section>
    </main>
  );
}

export default function LoginPage() {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) {
    throw new Error("NEXT_PUBLIC_PRIVY_APP_ID is required");
  }

  return (
    <PrivyProvider appId={appId}>
      <LoginPanel />
    </PrivyProvider>
  );
}
