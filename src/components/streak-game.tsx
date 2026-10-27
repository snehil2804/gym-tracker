"use client";

import { Award, CalendarCheck, Crown, Flame, Lock, Medal, Repeat, Shield, Sparkles, Star, Swords, Trophy, Zap } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { cx } from "@/components/ui";
import type { Core } from "@/lib/data/derived";
import { blocksOn } from "@/lib/domain/attendance";
import { formatShort, monthName } from "@/lib/domain/dates";
import { computeGame, type GameState, type MonthResult } from "@/lib/domain/game";

/** The streak game for this account (see src/lib/domain/game.ts for the rules). */
export function useGame(d: Core): GameState {
  return useMemo(() => {
    const first = d.attendance.reduce<string | null>((min, a) => (!min || a.date < min ? a.date : min), null);
    const start = d.trackingStart ?? first ?? d.today;
    return computeGame({
      attendance: d.attendance,
      today: d.today,
      start,
      isBreak: (day) => blocksOn(day, d.blocks).length > 0,
    });
  }, [d.attendance, d.today, d.trackingStart, d.blocks]);
}

const BADGE_ICON: Record<string, ReactNode> = {
  first: <Star className="size-4" />,
  s3: <Flame className="size-4" />,
  s7: <Swords className="size-4" />,
  pw: <CalendarCheck className="size-4" />,
  s14: <Shield className="size-4" />,
  double: <Zap className="size-4" />,
  comeback: <Repeat className="size-4" />,
  pm: <Trophy className="size-4" />,
  s30: <Crown className="size-4" />,
  d50: <Medal className="size-4" />,
};

/** Scoreboard above the calendar: streak, level and XP, this month's chase, and badges. */
export function GamePanel({ game, month, today }: { game: GameState; month: string; today: string }) {
  const m = game.months.get(month.slice(0, 7));
  const recentBreak = game.lastBreak && game.streak === 0 ? game.lastBreak : null;
  const earned = game.badges.filter((b) => b.earned).length;
  return (
    <section className="scoreboard relative mb-4 overflow-hidden rounded-3xl p-5 text-white shadow-pop sm:p-6">
      <div aria-hidden className="scoreboard-glow pointer-events-none absolute inset-0" />
      <div className="relative grid gap-5 sm:grid-cols-3 sm:gap-6">
        {/* Streak */}
        <div className="flex items-center gap-4">
          <div className={cx("streak-flame grid size-16 shrink-0 place-items-center rounded-2xl", game.streak > 0 ? "is-lit" : "is-out")}>
            <Flame className="size-9" strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <p className="num font-display text-4xl leading-none font-semibold">{game.streak}</p>
            <p className="mt-1 text-sm text-white/70">day streak · best {game.best}</p>
            <p className="mt-1 text-xs text-white/55">
              {recentBreak
                ? `Broken ${formatShort(recentBreak.date)} (${recentBreak.xp} XP). Train today to restart.`
                : game.todayOpen
                  ? game.streak > 0
                    ? `Train today to make it ${game.streak + 1}.`
                    : "Train today to start a streak."
                  : game.streak > 0
                    ? "Today's done. Keep the chain going."
                    : "Rest days never break a streak."}
            </p>
          </div>
        </div>

        {/* Level */}
        <div className="flex items-center gap-4 sm:border-l sm:border-white/10 sm:pl-6">
          <div className="level-badge grid size-16 shrink-0 place-items-center rounded-2xl">
            <span className="num font-display text-2xl font-bold">{game.level.n}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-xl font-semibold">{game.level.title}</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="xp-fill h-full rounded-full" style={{ width: `${Math.round(game.level.progress * 100)}%` }} />
            </div>
            <p className="num mt-1 text-xs text-white/60">
              {game.xp} XP{game.level.to !== null ? ` · ${game.level.to - game.xp} to level ${game.level.n + 1}` : " · max level"}
            </p>
          </div>
        </div>

        {/* Month chase */}
        <div className="flex items-center gap-4 sm:border-l sm:border-white/10 sm:pl-6">
          <MonthRing m={m} />
          <div className="min-w-0">
            <p className="font-display text-xl font-semibold">{monthName(month)}</p>
            <p className="mt-1 text-sm text-white/70">{monthLine(m, month, today)}</p>
          </div>
        </div>
      </div>

      {/* Badges */}
      <div className="relative mt-5 border-t border-white/10 pt-4">
        <p className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-white/50 uppercase">
          Badges · {earned}/{game.badges.length}
        </p>
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {game.badges.map((b) => (
            <span
              key={b.id}
              title={b.hint}
              className={cx(
                "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold",
                b.earned ? "badge-earned" : "border border-white/10 text-white/35",
              )}
            >
              {b.earned ? BADGE_ICON[b.id] ?? <Award className="size-4" /> : <Lock className="size-3.5" />}
              {b.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function monthLine(m: MonthResult | undefined, month: string, today: string) {
  if (!m) return month > today ? "Not started yet." : "Nothing tracked this month.";
  if (m.perfect) return "Perfect month — every training day won. +100 XP";
  if (m.complete) return `${m.won} of ${m.trainingDays} training days won.`;
  if (m.stillPerfect) return `${m.won} of ${m.trainingDays} won — still on track for a perfect month.`;
  return `${m.won} of ${m.trainingDays} won · perfect month lost (${m.missed} missed${m.unlogged ? `, ${m.unlogged} unlogged` : ""}).`;
}

function MonthRing({ m }: { m: MonthResult | undefined }) {
  const pct = m && m.trainingDays ? m.won / m.trainingDays : 0;
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid size-16 shrink-0 place-items-center">
      <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgb(255 255 255 / 0.1)" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={m?.perfect ? "url(#ring-gold)" : "url(#ring-ember)"}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className="transition-[stroke-dashoffset] duration-700"
        />
        <defs>
          <linearGradient id="ring-ember" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ff6a1a" />
            <stop offset="1" stopColor="#ffa526" />
          </linearGradient>
          <linearGradient id="ring-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffd56b" />
            <stop offset="1" stopColor="#e9a417" />
          </linearGradient>
        </defs>
      </svg>
      {m?.perfect ? <Trophy className="trophy-pop size-6 text-[#ffd56b]" /> : <span className="num text-sm font-semibold">{Math.round(pct * 100)}%</span>}
    </div>
  );
}

/** Big celebration strip shown on a perfect month. */
export function PerfectMonthBanner({ month }: { month: string }) {
  return (
    <div className="perfect-banner relative mb-4 overflow-hidden rounded-2xl px-5 py-4 text-[#2a1d00]">
      <div aria-hidden className="confetti">
        {Array.from({ length: 18 }, (_, i) => (
          <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 6) * 0.12}s`, background: ["#ff6a1a", "#ffd56b", "#2f9e66", "#3a7bd5"][i % 4] }} />
        ))}
      </div>
      <p className="relative flex items-center gap-2 font-display text-lg font-semibold">
        <Sparkles className="size-5" /> Perfect {monthName(month)}! Every training day won.
      </p>
    </div>
  );
}
