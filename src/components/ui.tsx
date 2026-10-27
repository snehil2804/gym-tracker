"use client";

import clsx from "clsx";
import { Dumbbell, Loader2, X } from "lucide-react";
import Link from "next/link";
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";

export const cx = clsx;
const noopSubscribe = () => () => {};

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-ink hover:opacity-90 active:opacity-80",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-surface-2 active:bg-surface-3",
  ghost: "text-ink-2 hover:bg-surface-2 active:bg-surface-3",
  danger: "bg-surface text-accent border border-accent/40 hover:bg-accent-soft",
  accent: "bg-accent text-accent-ink hover:opacity-90 active:opacity-80",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-5 text-[15px] gap-2 rounded-xl",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, icon, block, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cx(
        "inline-flex select-none items-center justify-center font-medium whitespace-nowrap transition-[background,opacity,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45",
        variants[variant],
        sizes[size],
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function LinkButton({
  href,
  variant = "secondary",
  size = "md",
  icon,
  className,
  children,
  block,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
  block?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex items-center justify-center font-medium whitespace-nowrap transition-[background,opacity] duration-150",
        variants[variant],
        sizes[size],
        block && "w-full",
        className,
      )}
    >
      {icon}
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------
export type CardGlow = "accent" | "warn" | "good" | "info" | "violet" | "pink" | "teal";

export function Card({
  children,
  className,
  as: As = "section",
  tone,
  glow,
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
  tone?: "accent" | "warn" | "plain";
  /** Soft colour wash in the card's corner; also tints the card header's eyebrow. */
  glow?: CardGlow;
}) {
  return (
    <As
      className={cx(
        "rounded-2xl border bg-surface shadow-card",
        glow && "card-glow",
        tone === "accent" ? "border-accent/35" : tone === "warn" ? "border-warn/35" : "border-line",
        className,
      )}
      style={glow ? ({ "--card-tone": `var(--${glow})` } as CSSProperties) : undefined}
    >
      {children}
    </As>
  );
}

export function CardHeader({
  title,
  eyebrow,
  action,
  className,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex items-start justify-between gap-3 px-5 pt-4", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="text-[11px] font-semibold tracking-[0.08em] text-(--card-tone,var(--muted)) uppercase">{eyebrow}</p>}
        <h2 className="truncate text-[15px] font-semibold text-ink">{title}</h2>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-[26px] leading-tight font-semibold tracking-tight text-ink sm:text-[30px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "accent" | "good" | "muted";
  className?: string;
}) {
  return (
    <div className={cx("min-w-0", className)}>
      <p className="text-xs text-muted">{label}</p>
      <p
        className={cx(
          "num font-display text-xl font-semibold tracking-tight",
          tone === "accent" ? "text-accent" : tone === "good" ? "text-good" : tone === "muted" ? "text-muted" : "text-ink",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
  icon,
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "loss" | "info" | "violet" | "rest" | "unknown" | "ink";
  icon?: ReactNode;
  className?: string;
}) {
  const tones = {
    neutral: "bg-surface-2 text-ink-2",
    good: "bg-good-soft text-good",
    warn: "bg-warn-soft text-warn",
    loss: "bg-accent-soft text-accent",
    info: "bg-info-soft text-info",
    violet: "bg-violet-soft text-violet",
    rest: "bg-rest-soft text-rest",
    unknown: "bg-unknown-soft text-unknown",
    ink: "bg-primary text-primary-ink",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** Marks a number as an estimate, consistently everywhere. */
export function Estimate({ children = "Estimate" }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-dashed border-line-strong px-1.5 py-px text-[10px] font-semibold tracking-wide text-muted uppercase">
      {children}
    </span>
  );
}

export function ProgressBar({
  segments,
  total,
  className,
  label,
}: {
  segments: { value: number; className: string; label: string }[];
  total: number;
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cx("flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-surface-2", className)}
      role="img"
      aria-label={label ?? segments.map((s) => `${s.label}: ${s.value}`).join(", ")}
    >
      {segments
        .filter((s) => s.value > 0)
        .map((s) => (
          <div key={s.label} className={cx("h-full first:rounded-l-full last:rounded-r-full", s.className)} style={{ width: `${(s.value / Math.max(total, 1)) * 100}%` }} />
        ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col items-center px-6 py-10 text-center", className)}>
      {icon && <div className="mb-3 grid size-11 place-items-center rounded-2xl bg-surface-2 text-muted">{icon}</div>}
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-xl bg-surface-2", className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("size-5 animate-spin text-muted", className)} aria-label="Loading" />;
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div role="alert" className="rounded-xl border border-accent/30 bg-accent-soft px-3 py-2 text-sm text-accent">
      {friendlyError(error)}
    </div>
  );
}

export function friendlyError(error: unknown): string {
  const msg =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : "Something went wrong.";
  if (/duplicate key value.*attendance_user_id_date/i.test(msg)) return "There is already a record for that date. Open it to edit instead.";
  if (/pt_ledger_one_consumption_per_day/i.test(msg)) return "A PT session is already recorded on that date.";
  if (/Failed to fetch|NetworkError/i.test(msg)) return "Can't reach the server. Check your connection and try again.";
  if (/JWT|not signed in/i.test(msg)) return "Your session has expired. Sign in again.";
  if (/violates check constraint/i.test(msg)) return "Some values are out of range. Check the form and try again.";
  return msg;
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------
export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-2">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-accent">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

const inputBase =
  "w-full min-w-0 rounded-xl border border-line-strong bg-surface px-3 text-[15px] text-ink placeholder:text-faint transition-colors focus:border-ink focus:outline-none sm:text-sm";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { prefix?: string }>(
  function Input({ className, prefix, ...rest }, ref) {
    if (prefix) {
      return (
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted">{prefix}</span>
          <input ref={ref} className={cx(inputBase, "h-11 pl-7", className)} {...rest} />
        </div>
      );
    }
    return <input ref={ref} className={cx(inputBase, "h-11", className)} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={cx(inputBase, "h-11 appearance-none bg-[length:16px] pr-8", className)} {...rest}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} className={cx(inputBase, "min-h-20 py-2.5", className)} {...rest} />;
});

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; icon?: ReactNode }[];
  className?: string;
  size?: "sm" | "md";
  ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cx("flex gap-1 rounded-xl bg-surface-2 p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "flex flex-1 items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors",
            size === "sm" ? "h-7 px-2 text-xs" : "h-9 px-3 text-[13px]",
            value === o.value ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Large tappable choice used in step-by-step sheets. */
export function Choice({
  selected,
  onClick,
  title,
  description,
  icon,
  tone,
}: {
  selected?: boolean;
  onClick: () => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  tone?: "accent" | "good" | "info" | "violet" | "warn";
}) {
  const toneIcon = {
    accent: "bg-accent-soft text-accent",
    good: "bg-good-soft text-good",
    info: "bg-info-soft text-info",
    violet: "bg-violet-soft text-violet",
    warn: "bg-warn-soft text-warn",
  };
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors",
        selected ? "border-ink bg-surface-2" : "border-line bg-surface hover:border-line-strong hover:bg-surface-2/60",
      )}
    >
      {icon && <span className={cx("grid size-10 shrink-0 place-items-center rounded-xl", tone ? toneIcon[tone] : "bg-surface-2 text-ink-2")}>{icon}</span>}
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-ink">{title}</span>
        {description && <span className="mt-0.5 block text-[13px] leading-snug text-muted">{description}</span>}
      </span>
    </button>
  );
}

export function Chip({
  selected,
  onClick,
  children,
}: {
  selected?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        "h-8 rounded-full border px-3 text-[13px] font-medium transition-colors",
        selected ? "border-ink bg-primary text-primary-ink" : "border-line-strong bg-surface text-ink-2 hover:bg-surface-2",
      )}
    >
      {children}
    </button>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span id={`${id}-label`} className="block text-sm font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative h-6 w-10 shrink-0 rounded-full transition-colors",
          checked ? "bg-good" : "bg-surface-3",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform",
            checked && "translate-x-4",
          )}
        />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sheet: bottom sheet on phones, centred dialog on larger screens.
// ---------------------------------------------------------------------------
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && panelRef.current) {
        const f = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => panelRef.current?.querySelector<HTMLElement>("[data-autofocus], button, input")?.focus(), 40);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="anim-fade absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx(
          "anim-sheet relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-surface shadow-pop sm:anim-rise sm:rounded-3xl",
          wide ? "sm:max-w-2xl" : "sm:max-w-md",
        )}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-surface-3 sm:hidden" aria-hidden />
        <div className="flex items-start justify-between gap-3 px-5 pt-3 pb-2 sm:pt-5">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-lg font-semibold text-ink">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          <button onClick={onClose} className="-mr-1 grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="pb-safe border-t border-line px-5 pt-3 pb-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------
type Toast = { id: number; text: ReactNode; tone: "good" | "error" | "info"; action?: { label: string; onClick: () => void } };
const ToastCtx = createContext<(t: Omit<Toast, "id">) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), t.tone === "error" ? 7000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              "anim-rise pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl px-4 py-3 text-sm shadow-pop",
              t.tone === "error" ? "bg-accent text-accent-ink" : "bg-primary text-primary-ink",
            )}
          >
            <span className="min-w-0">{t.text}</span>
            {t.action && (
              <button className="shrink-0 font-semibold underline underline-offset-2" onClick={t.action.onClick}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const push = useContext(ToastCtx);
  return {
    success: (text: ReactNode, action?: Toast["action"]) => push({ text, tone: "good", action }),
    error: (e: unknown) => push({ text: friendlyError(e), tone: "error" }),
    info: (text: ReactNode) => push({ text, tone: "info" }),
  };
}

// ---------------------------------------------------------------------------
// Confirm dialog (used only for destructive actions)
// ---------------------------------------------------------------------------
export function ConfirmSheet({
  open,
  onClose,
  title,
  children,
  confirmLabel = "Delete",
  onConfirm,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children?: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  loading?: boolean;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="text-sm text-ink-2">{children}</div>
    </Sheet>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-8 mb-3 flex items-center justify-between gap-3 first:mt-0">
      <h2 className="text-[13px] font-semibold tracking-[0.06em] text-muted uppercase">{children}</h2>
      {action}
    </div>
  );
}

export function KeyValue({ items, className }: { items: { k: ReactNode; v: ReactNode }[]; className?: string }) {
  return (
    <dl className={cx("divide-y divide-line", className)}>
      {items.map((it, i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
          <dt className="text-muted">{it.k}</dt>
          <dd className="num text-right font-medium text-ink">{it.v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Shown on personal-training pages when PT tracking is switched off in Settings. */
export function PtOffNotice() {
  return (
    <Card>
      <EmptyState
        icon={<Dumbbell className="size-5" />}
        title="Personal training is turned off"
        action={<LinkButton href="/settings#training" variant="primary">Turn it on in Settings</LinkButton>}
      >
        Hired a trainer? Switch on Personal training in Settings to track your PT package, sessions and their value.
      </EmptyState>
    </Card>
  );
}
