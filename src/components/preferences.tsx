"use client";

import { Eye, EyeOff } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { cx } from "@/components/ui";
import { formatMoney } from "@/lib/domain/money";

// ---------------------------------------------------------------------------
// Feature switches from the profile (personal training, gym membership tracking)
// ---------------------------------------------------------------------------
interface Features {
  pt: boolean;
  membership: boolean;
}
const FeaturesCtx = createContext<Features>({ pt: true, membership: true });
export const FeaturesProvider = FeaturesCtx.Provider;
export const useFeatures = () => useContext(FeaturesCtx);

// ---------------------------------------------------------------------------
// Money privacy: each card can hide its amounts. Remembered on this device only.
// ---------------------------------------------------------------------------
const STORAGE_KEY = "rl-hidden-money";

function readHidden(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

const PrivacyCtx = createContext<{ hidden: Set<string>; toggle: (id: string) => void }>({ hidden: new Set(), toggle: () => {} });

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(typeof window === "undefined" ? [] : readHidden()));
  useEffect(() => {
    const onStorage = (e: StorageEvent) => e.key === STORAGE_KEY && setHidden(new Set(readHidden()));
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const toggle = useCallback((id: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }, []);
  return <PrivacyCtx.Provider value={{ hidden, toggle }}>{children}</PrivacyCtx.Provider>;
}

const ScopeCtx = createContext<string | null>(null);

/** Wrap a card's contents so every <Money> inside it follows that card's eye toggle. */
export function MoneyScope({ id, children }: { id: string; children: ReactNode }) {
  return <ScopeCtx.Provider value={id}>{children}</ScopeCtx.Provider>;
}

export function useMoneyHidden(id?: string) {
  const scope = useContext(ScopeCtx);
  const { hidden } = useContext(PrivacyCtx);
  const key = id ?? scope;
  return key ? hidden.has(key) : false;
}

/** Eye button that shows/hides the amounts of one card. */
export function EyeToggle({ id, className }: { id: string; className?: string }) {
  const { hidden, toggle } = useContext(PrivacyCtx);
  const isHidden = hidden.has(id);
  const Icon = isHidden ? EyeOff : Eye;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(id);
      }}
      aria-pressed={isHidden}
      aria-label={isHidden ? "Show amounts" : "Hide amounts"}
      title={isHidden ? "Show amounts" : "Hide amounts"}
      className={cx(
        "grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink",
        isHidden && "bg-surface-2 text-ink",
        className,
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}

/** A money amount that turns into dots when its card is hidden. */
export function Money({ paise, prefix = "", className }: { paise: number; prefix?: string; className?: string }) {
  const hidden = useMoneyHidden();
  if (hidden)
    return (
      <span className={cx("select-none tracking-widest", className)} aria-label="Hidden amount">
        ₹••••
      </span>
    );
  return (
    <span className={className}>
      {prefix}
      {formatMoney(paise)}
    </span>
  );
}

/** Hides arbitrary text (e.g. a sentence containing amounts) when the card is hidden. */
export function Private({ children, placeholder = "Hidden" }: { children: ReactNode; placeholder?: ReactNode }) {
  const hidden = useMoneyHidden();
  return <>{hidden ? <span className="text-muted">{placeholder}</span> : children}</>;
}

/** Formatter that returns "₹••••" while the given card is hidden (for text, tables and chart labels). */
export function useMoneyFormatter(id: string) {
  const hidden = useMoneyHidden(id);
  return useCallback((paise: number) => (hidden ? "₹••••" : formatMoney(paise)), [hidden]);
}
