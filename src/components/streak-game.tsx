"use client";

import { Award, CalendarCheck, Crown, Flame, Gem, Lock, Medal, Repeat, Shield, Sparkles, Star, Swords, Target, Trophy, Zap } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { cx } from "@/components/ui";
import type { Core } from "@/lib/data/derived";
import { blocksOn } from "@/lib/domain/attendance";
import { addDays, formatShort, monthName, startOfWeek, weekdayLabel } from "@/lib/domain/dates";
import { computeGame, flameTier, type GameState, type MonthResult } from "@/lib/domain/game";

/** The streak game for this account (rules: src/lib/domain/game.ts). */
export function useGame(d: Core): GameState {
  const goal = d.profile.weekly_workout_goal;
  return useMemo(() => {
    const first = d.attendance.reduce<string | null>((min, a) => (!min || a.date < min ? a.date : min), null);
    const start = d.trackingStart ?? first ?? d.today;
    return computeGame({
      attendance: d.attendance,
      today: d.today,
      start,
      weeklyGoal: goal,
      isBreak: (day) => blocksOn(day, d.blocks).length > 0,
    });
  }, [d.attendance, d.today, d.trackingStart, d.blocks, goal]);
}

const BADGE_ICON: Record<string, ReactNode> = {
  first: <Star className="size-4" />,
  s3: <Flame className="size-4" />,
  gw: <CalendarCheck className="size-4" />,
  s7: <Swords className="size-4" />,
  double: <Zap className="size-4" />,
  comeback: <Repeat className="size-4" />,
  s14: <Shield className="size-4" />,
  w4: <Gem className="size-4" />,
  pm: <Trophy className="size-4" />,
  s30: <Crown className="size-4" />,
  d50: <Medal className="size-4" />,
  d100: <Award className="size-4" />,
};

const TIER_LABEL = { out: "No streak", spark: "Spark", fire: "On fire", blaze: "Blazing", inferno: "Unstoppable" } as const;

/** Scoreboard above the calendar: streak, this week's commitment, level, the month chase, badges. */
export function GamePanel({ game, month, today, goal }: { game: GameState; month: string; today: string; goal: number }) {
  const m = game.months.get(month.slice(0, 7));
  const tier = flameTier(game.streak);
  const recentBreak = game.lastBreak && game.streak === 0 ? game.lastBreak : null;
  const earned = game.badges.filter((b) => b.earned).length;
  const nextBadge = game.badges.find((b) => !b.earned);
  const w = game.thisWeek;
  const weekStart = startOfWeek(today);

  return (
    <section className="scoreboard relative mb-4 overflow-hidden rounded-3xl p-5 text-white shadow-pop sm:p-6">
      <div aria-hidden className="scoreboard-glow pointer-events-none absolute inset-0" />

      {/* Today's mission */}
      <div className="relative mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Target className="size-4 text-[#5eead4]" />
          {game.todayOpen ? (
            <>
              Today&apos;s mission: train and earn <span className="num font-semibold text-[#5eead4]">+{game.todayXp} XP</span>
            </>
          ) : recentBreak ? (
            <>Streak broken {formatShort(recentBreak.date)} ({recentBreak.xp} XP). Come back tomorrow and start a new one.</>
          ) : (
            <>Mission complete for today — see you tomorrow.</>
          )}
        </p>
        {nextBadge && (
          <p className="flex items-center gap-1.5 text-xs text-white/55">
            <Lock className="size-3.5" /> Next badge: <span className="font-semibold text-white/80">{nextBadge.label}</span> — {nextBadge.hint.toLowerCase()}
          </p>
        )}
      </div>

      <div className="relative grid gap-5 sm:grid-cols-3 sm:gap-6">
        {/* Day streak */}
        <div className="flex items-center gap-4">
          <div className={cx("streak-flame grid size-16 shrink-0 place-items-center rounded-2xl", `tier-${tier}`)}>
            <Flame className="size-9" strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <p className="num font-display text-4xl leading-none font-semibold">{game.streak}</p>
            <p className="mt-1 text-sm text-white/75">
              day streak · <span className="font-semibold">{TIER_LABEL[tier]}</span>
            </p>
            <p className="mt-0.5 text-xs text-white/55">Best {game.best} · off-days within your goal never break it</p>
          </div>
        </div>

        {/* This week vs the commitment */}
        <div className="sm:border-l sm:border-white/10 sm:pl-6">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-display text-xl font-semibold">
              <span className="num">{w?.won ?? 0}</span>
              <span className="text-white/50">/{w?.goal ?? goal}</span> this week
            </p>
            <p className={cx("text-xs font-semibold", w?.golden ? "text-[#ffd56b]" : "text-white/55")}>{w?.golden ? "Golden week ✦" : `goal ${goal}/wk`}</p>
          </div>
          <div className="mt-2.5 grid grid-cols-7 gap-1.5">
            {Array.from({ length: 7 }, (_, i) => {
              const day = addDays(weekStart, i);
              const g = game.days.get(day);
              const won = g === "won" || g === "double";
              return (
                <div key={day} className="flex flex-col items-center gap-1">
                  <span
                    className={cx(
                      "week-pip h-2.5 w-full rounded-full",
                      won ? (w?.golden ? "pip-gold" : "pip-won") : g === "missed" || g === "unlogged" ? "pip-miss" : g === "rest" || g === "skip" || g === "excused" ? "pip-rest" : "bg-white/12",
                      day === today && "pip-today",
                    )}
                    style={{ animationDelay: `${i * 60}ms` }}
                  />
                  <span className="text-[10px] text-white/45">{weekdayLabel(i + 1).charAt(0)}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-white/55">
            {game.weekStreak > 0 ? `${game.weekStreak} golden ${game.weekStreak === 1 ? "week" : "weeks"} in a row` : "Hit your goal with no misses to turn the week gold"}
          </p>
        </div>

        {/* Level + month */}
        <div className="space-y-4 sm:border-l sm:border-white/10 sm:pl-6">
          <div className="flex items-center gap-3">
            <div className="level-badge grid size-11 shrink-0 place-items-center rounded-xl">
              <span className="num font-display text-lg font-bold">{game.level.n}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline justify-between gap-2">
                <span className="font-display text-base font-semibold">{game.level.title}</span>
                <span className="num text-xs text-white/55">{game.xp} XP</span>
              </p>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="xp-fill h-full rounded-full" style={{ width: `${Math.round(game.level.progress * 100)}%` }} />
              </div>
              <p className="num mt-1 text-[11px] text-white/50">{game.level.to !== null ? `${game.level.to - game.xp} XP to level ${game.level.n + 1}` : "Max level"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <MonthRing m={m} />
            <div className="min-w-0">
              <p className="text-sm font-semibold">{monthName(month)}</p>
              <p className="text-xs text-white/60">{monthLine(m, month, today)}</p>
            </div>
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
              className={cx("flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold", b.earned ? "badge-earned" : "border border-white/10 text-white/35")}
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
  if (m.perfect) return "Golden month — every committed day done. +150 XP";
  if (m.complete) return `${m.won} days won.`;
  if (m.stillPerfect) return `${m.won} of ~${m.trainingDays} committed days — on track for a golden month.`;
  return `${m.won} of ~${m.trainingDays} committed days · golden month lost.`;
}

function MonthRing({ m }: { m: MonthResult | undefined }) {
  const pct = m && m.trainingDays ? Math.min(m.won / m.trainingDays, 1) : 0;
  const r = 24;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid size-14 shrink-0 place-items-center">
      <svg viewBox="0 0 60 60" className="absolute inset-0 -rotate-90">
        <circle cx="30" cy="30" r={r} fill="none" stroke="rgb(255 255 255 / 0.1)" strokeWidth="6" />
        <circle
          cx="30"
          cy="30"
          r={r}
          fill="none"
          stroke={m?.perfect || m?.stillPerfect ? "url(#ring-gold)" : "url(#ring-aurora)"}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className="transition-[stroke-dashoffset] duration-700"
        />
        <defs>
          <linearGradient id="ring-aurora" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#10b981" />
            <stop offset="0.5" stopColor="#06b6d4" />
            <stop offset="1" stopColor="#3b82f6" />
          </linearGradient>
          <linearGradient id="ring-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffe08a" />
            <stop offset="1" stopColor="#e9a417" />
          </linearGradient>
        </defs>
      </svg>
      {m?.perfect ? <Trophy className="trophy-pop size-6 text-[#ffd56b]" /> : <span className="num text-xs font-semibold">{Math.round(pct * 100)}%</span>}
    </div>
  );
}

/** Celebration strip shown on a golden month. */
export function PerfectMonthBanner({ month }: { month: string }) {
  return (
    <div className="perfect-banner relative mb-4 overflow-hidden rounded-2xl px-5 py-4 text-[#2a1d00]">
      <div aria-hidden className="confetti">
        {Array.from({ length: 18 }, (_, i) => (
          <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 6) * 0.12}s`, background: ["#10b981", "#ffd56b", "#06b6d4", "#3b82f6"][i % 4] }} />
        ))}
      </div>
      <p className="relative flex items-center gap-2 font-display text-lg font-semibold">
        <Sparkles className="size-5" /> Golden {monthName(month)}! Every day you committed to — done.
      </p>
    </div>
  );
}
