import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { Providers } from "@/components/providers";

export const metadata: Metadata = { title: "Welcome" };

export default function WelcomeLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <Suspense>{children}</Suspense>
    </Providers>
  );
}
