import { Suspense, type ReactNode } from "react";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/shell";
import { PageFallback } from "@/components/page-fallback";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <Suspense fallback={<PageFallback />}>
        <AppShell>{children}</AppShell>
      </Suspense>
    </Providers>
  );
}
