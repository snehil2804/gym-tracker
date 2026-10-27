import { ArrowRightLeft, Ban, CalendarX, Check, CheckCheck, CircleDashed, Dumbbell, HelpCircle, Minus, Moon, X } from "lucide-react";
import { DAY_KIND, type DayKind } from "@/lib/domain/attendance";
import { cx } from "@/components/ui";

/** Each state has its own icon AND colour so it never relies on colour alone. */
export const DAY_STYLE: Record<DayKind, { icon: typeof Check; cell: string; dot: string; text: string }> = {
  trained: { icon: CheckCheck, cell: "bg-good-soft text-good", dot: "bg-good", text: "text-good" },
  pt_only: { icon: Check, cell: "bg-good-soft text-good", dot: "bg-good", text: "text-good" },
  gym_only: { icon: Dumbbell, cell: "bg-good-soft/60 text-good ring-1 ring-inset ring-good/30", dot: "bg-good/60", text: "text-good" },
  charged: { icon: X, cell: "bg-accent-soft text-accent", dot: "bg-accent", text: "text-accent" },
  missed: { icon: Minus, cell: "bg-warn-soft text-warn", dot: "bg-warn", text: "text-warn" },
  missed_unconfirmed: { icon: HelpCircle, cell: "bg-warn-soft text-warn outline-1 outline-dashed -outline-offset-1 outline-warn/60", dot: "bg-warn", text: "text-warn" },
  cancelled: { icon: Ban, cell: "bg-info-soft text-info", dot: "bg-info", text: "text-info" },
  self_cancelled: { icon: CalendarX, cell: "bg-surface-3 text-ink-2", dot: "bg-ink-2", text: "text-ink-2" },
  rescheduled: { icon: ArrowRightLeft, cell: "bg-violet-soft text-violet", dot: "bg-violet", text: "text-violet" },
  rest: { icon: Moon, cell: "bg-rest-soft text-rest", dot: "bg-rest", text: "text-rest" },
  unverified: { icon: CircleDashed, cell: "hatch text-unknown", dot: "bg-unknown", text: "text-unknown" },
  not_scheduled: { icon: Minus, cell: "text-faint", dot: "bg-line-strong", text: "text-faint" },
  future: { icon: Minus, cell: "text-ink-2", dot: "bg-transparent", text: "text-muted" },
  before: { icon: Minus, cell: "text-faint opacity-50", dot: "bg-transparent", text: "text-faint" },
};

export function DayIcon({ kind, className }: { kind: DayKind; className?: string }) {
  const Icon = DAY_STYLE[kind].icon;
  return <Icon className={cx("size-3.5", className)} aria-hidden />;
}

export function DayBadge({ kind, className }: { kind: DayKind; className?: string }) {
  const s = DAY_STYLE[kind];
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", s.cell, className)}>
      <DayIcon kind={kind} className="size-3" />
      {DAY_KIND[kind].label}
    </span>
  );
}

const LEGEND: DayKind[] = ["trained", "pt_only", "gym_only", "charged", "missed", "missed_unconfirmed", "cancelled", "self_cancelled", "rescheduled", "rest", "unverified", "not_scheduled"];

export function DayLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
      {LEGEND.map((k) => (
        <li key={k} className="flex items-center gap-1.5">
          <span className={cx("grid size-5 place-items-center rounded-md", DAY_STYLE[k].cell)}>
            <DayIcon kind={k} className="size-3" />
          </span>
          {DAY_KIND[k].label}
        </li>
      ))}
    </ul>
  );
}
