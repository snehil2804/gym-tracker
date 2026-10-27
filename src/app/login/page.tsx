import type { Metadata } from "next";
import { Suspense } from "react";
import { LiftLogo } from "@/components/logo";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[#0b1018] p-12 text-[#eef2f7] lg:flex lg:flex-col">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 50% at 0% 0%, rgb(16 185 129 / 0.30), transparent 70%), radial-gradient(55% 50% at 100% 100%, rgb(37 99 235 / 0.32), transparent 70%), radial-gradient(40% 35% at 85% 20%, rgb(6 182 212 / 0.18), transparent 70%)",
          }}
        />
        <div className="relative flex items-center gap-3">
          <LiftLogo size={40} className="shadow-brand" />
          <span className="font-display text-lg font-semibold">Rep Ledger</span>
        </div>
        <div className="relative mt-auto max-w-md">
          <p className="font-display text-4xl leading-[1.1] font-semibold tracking-tight">
            Every session you paid for, <span className="text-brand">accounted for.</span>
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-[#a9b4c4]">
            Membership, PT packages, attendance and workouts in one honest ledger — completed sessions, missed sessions and the
            money behind them, kept straight.
          </p>
          <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-white/10 pt-6 text-sm">
            <div>
              <dt className="text-[#7b879a]">Sessions</dt>
              <dd className="mt-1 font-medium">Ledger-backed</dd>
            </div>
            <div>
              <dt className="text-[#7b879a]">Losses</dt>
              <dd className="mt-1 font-medium">Only when confirmed</dd>
            </div>
            <div>
              <dt className="text-[#7b879a]">Your data</dt>
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
