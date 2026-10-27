"use client";

import { ArrowLeft, ArrowRight, Check, Dumbbell, IdCard, PartyPopper, Target, UserRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { AvatarUploader } from "@/components/avatar";
import { ScheduleDays } from "@/components/package-sheets";
import { PageFallback } from "@/components/page-fallback";
import { Button, Chip, Choice, Field, Input, Segmented, cx, useToast } from "@/components/ui";
import { useCreatePackage, useProfile, useSaveMeasurement, useSaveMembership, useToday, useUpdateProfile, useUser } from "@/lib/data/hooks";
import { addDays, addMonths, ageOn, formatDate } from "@/lib/domain/dates";
import { formatMoney, parseMoneyToPaise, sessionValue } from "@/lib/domain/money";

const STEPS = [
  { key: "you", label: "About you", icon: UserRound },
  { key: "gym", label: "Gym", icon: IdCard },
  { key: "pt", label: "Trainer", icon: Dumbbell },
  { key: "goal", label: "Goal", icon: Target },
] as const;

const noop = () => () => {};

export default function WelcomePage() {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const { data: profile, isLoading } = useProfile();
  const router = useRouter();
  // Once the flow is under way, keep it on screen through the final "all set" step.
  const [inFlow, setInFlow] = useState(false);
  const alreadyDone = !!profile?.onboarded_at && !inFlow;
  useEffect(() => {
    if (alreadyDone) router.replace("/");
  }, [alreadyDone, router]);
  if (!mounted || isLoading || !profile || alreadyDone) return <PageFallback />;
  return <Onboarding onSaving={() => setInFlow(true)} />;
}

function Onboarding({ onSaving }: { onSaving: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const today = useToday();
  const { data: user } = useUser();
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();
  const saveMeasurement = useSaveMeasurement();
  const saveMembership = useSaveMembership();
  const createPackage = useCreatePackage();

  const googleName = (user?.user_metadata as { full_name?: string; name?: string } | undefined)?.full_name ?? (user?.user_metadata as { name?: string } | undefined)?.name ?? "";
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // About you
  const [nameInput, setName] = useState<string | null>(null);
  const name = nameInput ?? (googleName || profile?.display_name || "");
  const [birth, setBirth] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  // Gym
  const [hasGym, setHasGym] = useState<boolean | null>(null);
  const [gymName, setGymName] = useState("");
  const [gymStart, setGymStart] = useState(today);
  const [gymMonths, setGymMonths] = useState("3");
  const [gymPrice, setGymPrice] = useState("");
  // Trainer
  const [hasPt, setHasPt] = useState<boolean | null>(null);
  const [trainer, setTrainer] = useState("");
  const [ptPrice, setPtPrice] = useState("");
  const [ptSessions, setPtSessions] = useState("");
  const [ptStart, setPtStart] = useState(today);
  const [ptPaid, setPtPaid] = useState<"paid" | "pending">("paid");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [noSunday, setNoSunday] = useState(true);
  // Goal
  const [goal, setGoal] = useState(4);

  const age = ageOn(birth, today);
  const gymPricePaise = gymPrice ? parseMoneyToPaise(gymPrice) : 0;
  const ptPricePaise = parseMoneyToPaise(ptPrice);
  const ptN = Number.parseInt(ptSessions, 10);
  const gymEnd = Number(gymMonths) > 0 ? addDays(addMonths(gymStart, Number(gymMonths)), -1) : null;

  const errors = useMemo(() => {
    const e: Record<number, string | null> = { 0: null, 1: null, 2: null, 3: null };
    if (!name.trim()) e[0] = "Tell us what to call you.";
    else if (birth && (birth > today || age === null)) e[0] = "Check your birth date.";
    else if (height && !(Number(height) >= 50 && Number(height) <= 272)) e[0] = "Height should be in centimetres (50–272).";
    else if (weight && !(Number(weight) > 20 && Number(weight) < 400)) e[0] = "Weight should be in kilograms.";
    if (hasGym === null) e[1] = "Choose one to continue.";
    else if (hasGym && (!gymName.trim() || !(Number(gymMonths) > 0) || gymPricePaise === null)) e[1] = "Add your gym's name and plan length.";
    if (hasPt === null) e[2] = "Choose one to continue.";
    else if (hasPt && (!trainer.trim() || !ptPricePaise || !(ptN > 0) || days.length === 0)) e[2] = "Add the trainer, price and number of sessions.";
    return e;
  }, [name, birth, height, weight, today, age, hasGym, gymName, gymMonths, gymPricePaise, hasPt, trainer, ptPricePaise, ptN, days]);

  async function finish() {
    setSaving(true);
    onSaving();
    try {
      if (hasGym) {
        await saveMembership.mutateAsync({
          gym_name: gymName.trim(),
          start_date: gymStart,
          duration_months: Number(gymMonths),
          price_paise: gymPricePaise ?? 0,
          price_is_approximate: false,
          payment_status: gymPricePaise ? "paid" : "unconfirmed",
          paid_on: gymPricePaise ? gymStart : null,
        });
      }
      if (hasPt && ptPricePaise) {
        await createPackage.mutateAsync({
          trainer_name: trainer.trim(),
          price_paise: ptPricePaise,
          sessions_purchased: ptN,
          start_date: ptStart,
          purchased_on: ptPaid === "paid" ? ptStart : null,
          schedule_days: days,
          exclude_sundays: noSunday,
          sessions_per_week: days.length,
          payments: [ptPaid === "paid" ? { amount_paise: ptPricePaise, status: "paid", paid_on: ptStart } : { amount_paise: ptPricePaise, status: "pending" }],
        });
      }
      if (weight) await saveMeasurement.mutateAsync({ measured_on: today, metric: "Body weight", value: Number(weight), unit: "kg", note: null });
      await updateProfile.mutateAsync({
        display_name: name.trim(),
        birth_date: birth || null,
        height_cm: height ? Number(height) : null,
        pt_enabled: !!hasPt,
        membership_enabled: !!hasGym,
        weekly_workout_goal: goal,
        tracking_start_date: profile?.tracking_start_date ?? today,
        onboarded_at: new Date().toISOString(),
      });
      setStep(4);
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  }

  const next = () => (step === 3 ? finish() : setStep((s) => s + 1));
  const canNext = !errors[step];

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="mx-auto flex w-full max-w-xl items-center justify-between px-5 pt-6">
        <span className="font-display text-lg font-semibold">Rep Ledger</span>
        {step < 4 && <span className="text-sm text-muted">Step {step + 1} of 4</span>}
      </header>

      {step < 4 && (
        <ol className="mx-auto mt-5 grid w-full max-w-xl grid-cols-4 gap-2 px-5" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s.key} className="space-y-1.5">
              <span className={cx("block h-1.5 rounded-full transition-colors duration-500", i <= step ? "bg-ink" : "bg-surface-3")} />
              <span className={cx("hidden text-[11px] font-medium sm:block", i === step ? "text-ink" : "text-muted")}>{s.label}</span>
            </li>
          ))}
        </ol>
      )}

      <main className="mx-auto w-full max-w-xl flex-1 px-5 pt-8 pb-36">
        <div key={step} className="anim-rise">
          {step === 0 && (
            <Section title="Welcome! Let's get you set up." subtitle="A few basics so your dashboard fits you. Everything here is optional except your name — you can fill the rest in Settings later.">
              <div className="flex justify-center pb-2">
                <AvatarUploader size={104} />
              </div>
              <Field label="What should we call you?">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" data-autofocus />
              </Field>
              <Field label="Birth date" hint={age !== null ? `You're ${age}.` : "We use it to show your age."}>
                <Input type="date" value={birth} max={today} onChange={(e) => setBirth(e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Height (cm)">
                  <Input inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value.replace(/[^\d.]/g, ""))} placeholder="175" />
                </Field>
                <Field label="Weight (kg)">
                  <Input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, ""))} placeholder="72" />
                </Field>
              </div>
              <Note>Skipping is fine — add or change any of this later in Settings.</Note>
            </Section>
          )}

          {step === 1 && (
            <Section title="Do you have an active gym membership?" subtitle="We'll keep track of when it ends and remind you before it does.">
              <div className="grid gap-2">
                <Choice selected={hasGym === true} onClick={() => setHasGym(true)} icon={<Check className="size-5" />} tone="good" title="Yes, track it for me" description="Add the gym and your plan." />
                <Choice selected={hasGym === false} onClick={() => setHasGym(false)} icon={<X className="size-5" />} title="Not right now" description="You can add a membership later in Settings." />
              </div>
              {hasGym && (
                <div className="anim-rise space-y-4 rounded-2xl border border-line bg-surface p-4">
                  <Field label="Gym name">
                    <Input value={gymName} onChange={(e) => setGymName(e.target.value)} placeholder="Your gym's name" />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Start date">
                      <Input type="date" value={gymStart} onChange={(e) => setGymStart(e.target.value)} />
                    </Field>
                    <Field label="Price (optional)">
                      <Input prefix="₹" inputMode="decimal" value={gymPrice} onChange={(e) => setGymPrice(e.target.value)} placeholder="5,000" />
                    </Field>
                  </div>
                  <Field label="Plan length">
                    <div className="flex flex-wrap gap-2">
                      {["1", "3", "6", "12"].map((m) => (
                        <Chip key={m} selected={gymMonths === m} onClick={() => setGymMonths(m)}>
                          {m} {m === "1" ? "month" : "months"}
                        </Chip>
                      ))}
                    </div>
                  </Field>
                  {gymEnd && (
                    <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink-2">
                      Estimated last day <strong>{formatDate(gymEnd)}</strong>. Confirm the exact date from your contract later in Settings.
                    </p>
                  )}
                </div>
              )}
            </Section>
          )}

          {step === 2 && (
            <Section title="Have you hired a personal trainer?" subtitle="If you have a PT package, we'll track every session, what's left and the value of sessions you miss.">
              <div className="grid gap-2">
                <Choice selected={hasPt === true} onClick={() => setHasPt(true)} icon={<Dumbbell className="size-5" />} tone="good" title="Yes, I have a PT package" description="Track sessions, payments and renewals." />
                <Choice selected={hasPt === false} onClick={() => setHasPt(false)} icon={<X className="size-5" />} title="No personal trainer" description="We'll keep personal-training features out of your way." />
              </div>
              {hasPt === false && <Note>Hired a trainer later? Turn on Personal training in Settings and everything appears.</Note>}
              {hasPt && (
                <div className="anim-rise space-y-4 rounded-2xl border border-line bg-surface p-4">
                  <Field label="Trainer's name">
                    <Input value={trainer} onChange={(e) => setTrainer(e.target.value)} placeholder="Trainer's name" />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Package price">
                      <Input prefix="₹" inputMode="decimal" value={ptPrice} onChange={(e) => setPtPrice(e.target.value)} placeholder="6,000" />
                    </Field>
                    <Field label="Sessions">
                      <Input inputMode="numeric" value={ptSessions} onChange={(e) => setPtSessions(e.target.value.replace(/\D/g, ""))} placeholder="30" />
                    </Field>
                  </div>
                  {ptPricePaise && ptN > 0 ? (
                    <p className="text-sm text-muted">
                      That&apos;s <strong className="text-ink">{formatMoney(sessionValue(1, ptPricePaise, ptN))}</strong> per session.
                    </p>
                  ) : null}
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Package starts">
                      <Input type="date" value={ptStart} onChange={(e) => setPtStart(e.target.value)} />
                    </Field>
                    <Field label="Payment">
                      <Segmented
                        value={ptPaid}
                        onChange={setPtPaid}
                        options={[
                          { value: "paid", label: "Paid" },
                          { value: "pending", label: "Pending" },
                        ]}
                      />
                    </Field>
                  </div>
                  <ScheduleDays days={days} setDays={setDays} noSunday={noSunday} setNoSunday={setNoSunday} />
                </div>
              )}
            </Section>
          )}

          {step === 3 && (
            <Section title="How many days a week do you want to train?" subtitle="Your weekly goal shows on the dashboard. Change it anytime.">
              <div className="grid grid-cols-7 gap-2">
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setGoal(n)}
                    aria-pressed={goal === n}
                    className={cx(
                      "aspect-square rounded-2xl border text-lg font-semibold transition-all",
                      goal === n ? "scale-105 border-ink bg-primary text-primary-ink shadow-pop" : "border-line-strong bg-surface text-ink-2 hover:bg-surface-2",
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-center text-sm text-muted">
                {goal} {goal === 1 ? "day" : "days"} a week · Sundays count as rest days unless you log them.
              </p>
            </Section>
          )}

          {step === 4 && (
            <div className="pt-6 text-center">
              <div className="mx-auto grid size-20 place-items-center rounded-full bg-good-soft text-good">
                <PartyPopper className="size-9" />
              </div>
              <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight">You&apos;re all set{name ? `, ${name.split(" ")[0]}` : ""}!</h1>
              <ul className="mx-auto mt-6 max-w-sm space-y-2 text-left text-sm">
                <Done ok>Profile saved{age !== null ? ` · ${age} years` : ""}</Done>
                <Done ok={!!hasGym}>{hasGym ? `${gymName} membership tracked until ${gymEnd ? formatDate(gymEnd) : "—"} (estimate)` : "No gym membership tracked"}</Done>
                <Done ok={!!hasPt}>{hasPt ? `${trainer}'s package: ${ptN} sessions` : "Personal training is off — turn it on anytime in Settings"}</Done>
                <Done ok>Goal: {goal} training days a week</Done>
              </ul>
              <Button variant="primary" size="lg" className="mt-8 px-8" onClick={() => router.replace("/")} icon={<ArrowRight className="size-4" />}>
                Go to my dashboard
              </Button>
            </div>
          )}
        </div>
      </main>

      {step < 4 && (
        <footer className="pb-safe fixed inset-x-0 bottom-0 border-t border-line bg-surface/95 backdrop-blur">
          <div className="mx-auto flex max-w-xl items-center gap-3 px-5 py-3">
            {step > 0 ? (
              <Button variant="ghost" onClick={() => setStep((s) => s - 1)} icon={<ArrowLeft className="size-4" />}>
                Back
              </Button>
            ) : (
              <span />
            )}
            <div className="ml-auto flex items-center gap-3">
              {errors[step] && (hasGym !== null || step !== 1) && (hasPt !== null || step !== 2) && (
                <span className="hidden text-xs text-accent sm:block">{errors[step]}</span>
              )}
              {step === 0 && (
                <Button
                  variant="ghost"
                  disabled={!name.trim()}
                  onClick={() => {
                    setBirth("");
                    setHeight("");
                    setWeight("");
                    setStep(1);
                  }}
                >
                  Skip details
                </Button>
              )}
              <Button variant="primary" size="lg" disabled={!canNext} loading={saving} onClick={next} icon={step === 3 ? <Check className="size-4" /> : undefined}>
                {step === 3 ? "Finish setup" : "Continue"}
              </Button>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="space-y-5">
      <div>
        <h1 className="font-display text-[28px] leading-tight font-semibold tracking-tight sm:text-[32px]">{title}</h1>
        <p className="mt-2 text-[15px] text-muted">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-info-soft px-3 py-2.5 text-sm text-info">{children}</p>;
}

function Done({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5">
      <span className={cx("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", ok ? "bg-good text-white" : "bg-surface-3 text-muted")}>
        {ok ? <Check className="size-3" /> : <X className="size-3" />}
      </span>
      <span className="text-ink-2">{children}</span>
    </li>
  );
}
