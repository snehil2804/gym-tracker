import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[#18160f] p-12 text-[#f5f3ee] lg:flex lg:flex-col">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-[11px] bg-[#f5f3ee] text-[#18160f]">
            <svg viewBox="0 0 64 64" className="size-6" aria-hidden>
              <rect x="14" y="27" width="6" height="10" rx="2" fill="currentColor" />
              <rect x="44" y="27" width="6" height="10" rx="2" fill="currentColor" />
              <rect x="20" y="22" width="5" height="20" rx="2" fill="currentColor" />
              <rect x="39" y="22" width="5" height="20" rx="2" fill="currentColor" />
              <rect x="25" y="30" width="14" height="4" rx="2" fill="#d9481f" />
            </svg>
          </span>
          <span className="font-display text-lg font-semibold">Rep Ledger</span>
        </div>
        <div className="mt-auto max-w-md">
          <p className="font-display text-4xl leading-[1.1] font-semibold tracking-tight">
            Every session you paid for, <span className="text-[#ff6a3d]">accounted for.</span>
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-[#bdb7aa]">
            Membership, PT packages, attendance and workouts in one honest ledger — completed sessions, missed sessions and the
            money behind them, kept straight.
          </p>
          <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-white/10 pt-6 text-sm">
            <div>
              <dt className="text-[#8f897c]">Sessions</dt>
              <dd className="mt-1 font-medium">Ledger-backed</dd>
            </div>
            <div>
              <dt className="text-[#8f897c]">Losses</dt>
              <dd className="mt-1 font-medium">Only when confirmed</dd>
            </div>
            <div>
              <dt className="text-[#8f897c]">Your data</dt>
              <dd className="mt-1 font-medium">Private by default</dd>
            </div>
          </dl>
        </div>
      </aside>
      <main className="flex items-center justify-center px-5 py-12">
        <Suspense>
          <LoginForm />
        </Suspense>
      </main>
    </div>
  );
}
