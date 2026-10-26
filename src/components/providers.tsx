"use client";

import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ToastProvider } from "@/components/ui";
import { getSupabase } from "@/lib/supabase/client";
import { useProfile } from "@/lib/data/hooks";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 },
          mutations: { retry: 0 },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <AccountInit />
        <ThemeSync />
        <AuthWatcher />
        {children}
      </ToastProvider>
    </QueryClientProvider>
  );
}

/**
 * Calls initialize_account() once per browser session. The database function is
 * idempotent: it creates defaults (and, for the owner account only, the initial
 * personal records) exactly once, no matter how often it runs.
 */
function AccountInit() {
  const qc = useQueryClient();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const flag = "rl-init";
    try {
      if (sessionStorage.getItem(flag)) return;
    } catch {}
    getSupabase()
      .rpc("initialize_account")
      .then(({ data, error }) => {
        if (error) return;
        try {
          sessionStorage.setItem(flag, "1");
        } catch {}
        if (data && (data as { seeded?: boolean }).seeded) qc.invalidateQueries();
        else qc.invalidateQueries({ queryKey: ["exercises"] });
        qc.invalidateQueries({ queryKey: ["profile"] });
      });
  }, [qc]);
  return null;
}

function ThemeSync() {
  const { data } = useProfile();
  useEffect(() => {
    if (!data) return;
    const root = document.documentElement;
    if (data.theme === "system") delete root.dataset.theme;
    else root.dataset.theme = data.theme;
    try {
      localStorage.setItem("rl-theme", data.theme);
    } catch {}
  }, [data]);
  return null;
}

/** Sends the user to /login when the session ends in this or another tab. */
function AuthWatcher() {
  const qc = useQueryClient();
  useEffect(() => {
    const { data } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        qc.clear();
        try {
          sessionStorage.removeItem("rl-init");
        } catch {}
        window.location.replace("/login");
      }
    });
    return () => data.subscription.unsubscribe();
  }, [qc]);
  return null;
}
