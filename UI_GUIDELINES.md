# UI guidelines — "ink & ember"

Rep Ledger should feel like a calm personal ledger, not an admin dashboard. Data is the loud part;
chrome is quiet.

## Identity
- **Paper** backgrounds (`--bg #f5f3ee` light / `#11100d` dark), white/near-black **surfaces**.
- **Ink** (`--primary`) for primary actions and the selected state. Primary buttons are ink, not colour.
- **Ember** (`--accent #d9481f` / `#ff6a3d`) is reserved for **money lost and things needing
  attention** (missed value, destructive confirms, errors). Never use it decoratively.
- Fonts: **Geist** for UI text (`--font-body`), **Bricolage Grotesque** for headings and hero numbers
  (`font-display`). Numbers use `.num` (tabular figures).
- Brand mark: dumbbell glyph with an ember grip (`src/app/icon.svg`, `Brand` in `shell.tsx`).

## Tokens (defined in `src/app/globals.css`)

| Token | Use |
|---|---|
| `bg`, `surface`, `surface-2`, `surface-3` | page, cards, insets/hover, pressed |
| `ink`, `ink-2`, `muted`, `faint` | text hierarchy |
| `line`, `line-strong` | borders/dividers, input borders |
| `primary`, `primary-ink` | primary buttons, selected chips/segments |
| `accent`, `accent-soft` | losses, alerts, destructive |
| `good`/`warn`/`info`/`violet`/`rest`/`unknown` (+ `-soft`) | status colours only |
| `chart-good`, `chart-loss`, `chart-ink`, `chart-grid` | chart marks (validated per theme) |

Use Tailwind classes generated from tokens (`bg-surface`, `text-muted`, `border-line`…). Do not
hard-code hex values in components (the login hero panel is the one exception).

Theme: `system | light | dark` stored in `profiles.theme`, mirrored to `localStorage('rl-theme')`
and applied before paint by the inline script in `layout.tsx`.

## Status language (never colour alone)
Every attendance state has an **icon + colour + label** (`src/components/day-status.tsx`):

| State | Icon | Tone |
|---|---|---|
| Gym + PT done | double check | good |
| PT done | check | good |
| Gym, no PT | dumbbell | good (outlined) |
| PT missed (charged) | × | ember |
| Missed gym | minus | warn |
| Missed · PT unconfirmed | ? | warn, dashed outline |
| Trainer cancelled | ban | info |
| I cancelled (“Snehil cancelled”) | calendar-x | neutral (surface-3) |
| Rescheduled | arrows | violet |
| Rest day (also every unlogged Sunday) | moon | rest |
| Not confirmed | dashed circle | unknown, hatched fill |
| No PT scheduled | minus | faint |

Estimates always carry the `<Estimate />` tag; confirmed values use a `Confirmed` badge.

## Components (`src/components/ui.tsx`)
- `Button` variants: `primary` (ink), `secondary`, `ghost`, `accent` (ember, destructive confirm), `danger` (outlined).
  Sizes `sm` 32px, `md` 40px, `lg` 48px. Loading shows a spinner and disables.
- `Card` (16px radius, hairline border, soft shadow), `CardHeader` (eyebrow + title + action).
- `Sheet`: bottom sheet on phones, centred dialog ≥ 640px; focus trap, Escape, scroll lock.
- `Choice`: large tappable option with icon and description — used in step-by-step flows.
- `Segmented`, `Chip`, `Switch`, `Field` + `Input`/`Select`/`Textarea`, `Stat`, `Badge`,
  `ProgressBar`, `EmptyState`, `Skeleton`, `ErrorNote`, `KeyValue`, `ConfirmSheet`, toasts via `useToast()`.

## Layout
- Desktop: fixed 240px sidebar, content max-width 6xl.
- Mobile: sticky top bar, **bottom tab bar** (Today, Calendar, **Log**, Workouts, More) with the Log
  button in the thumb zone; content has bottom padding so nothing hides behind the bar.
- Grids collapse to one column; wide tables scroll horizontally inside their card.
- Minimum tap target 44px (calendar cells, nav items, chips are 32px+ with spacing).
- 16px side gutter on phones, 24px+ on desktop.

## Interaction rules
- **Fewest taps for daily actions:** "I went → PT done" is two taps; rest day is one.
- **Show the consequence before saving** anything that changes the PT balance or money
  (e.g. "Uses 1 of 28 sessions (₹200)"). Badges `−1 session` mark consuming options.
- **Confirm only destructive actions** (delete, clear day, void). Everything else saves directly,
  with an **Undo** toast where practical.
- Never infer a paid session from ambiguous input; pre-select only on explicit text and say why.
- Errors are human sentences (`friendlyError`), never raw SQL.
- Empty states explain what will appear and offer the next action; never fake data.

## Motion
- `anim-rise` (280ms) for page entrance, `anim-sheet` for bottom sheets, `active:scale-[0.98]` on buttons.
- All motion is disabled under `prefers-reduced-motion`.

## Charts (`src/components/charts.tsx`)
- One y-axis only; bars ≤ 24px with 4px rounded tops; 2px lines; 8px dots with a 2px surface ring;
  hairline solid grid.
- Single series → no legend (the title names it). Two+ series → legend.
- Attended vs missed uses `chart-good`/`chart-loss`; the missed series is also **hatched** because
  the light-mode pair is only in the colour-blind "floor" band.
- Every chart has a **"Show as table"** toggle and hover tooltips.
- Text never uses series colours.
- Re-validate palette changes with the dataviz validator for both themes.

## Personalisation & privacy
- Respect the user's switches: when `useFeatures().pt` is false, no PT wording, cards, states or options
  appear anywhere (`dayLabel()` gives gym-only labels). Never delete data when a feature is hidden.
- Any card that shows money gets an `<EyeToggle id="…" />` in its header and renders amounts with
  `<Money>` / `useMoneyFormatter(id)` so the toggle masks them as ₹••••.
- First-run flow: one question per screen, big `Choice` buttons, progress bar, Back/Continue footer,
  "skip" always available for optional details, and a friendly summary at the end.
- Avatars are circles with a soft gradient ring; tapping opens the file picker, with Remove nearby.
- Every photo upload goes through `PhotoEditor` (crop/zoom/rotate) before saving; progress photos also
  offer *Use original*.

## Writing style
- Plain, short, second person: "You missed 1 chargeable PT session this month — ₹200 of prepaid value."
- Money: Indian format via `formatMoney` (₹6,000, ₹1,23,456, ₹333.33).
- Dates: `formatDate` / `formatShort` ("Tue, 27 Oct"); relative words for near dates ("Tomorrow").
- Say "unconfirmed", never imply unknown days were missed or attended.

## Motion & colour (added Oct 2026)
- Brand mark: `<LiftLogo size={…} />` from `src/components/logo.tsx`. Don't hand-draw the old
  barbell SVG. Use `still` where motion would distract.
- Nav icons get `ico ico-<move>` classes; add new moves in `globals.css` next to the others and
  keep them under ~1 s.
- Main call-to-action uses `bg-brand shadow-brand`; everything else stays on the token palette.
- Cards that summarise one topic may take `glow` (`accent | warn | good | info | violet | pink | teal`);
  the card header's eyebrow picks up the same colour. Don't use more than one glow colour per card.
- Every animation must be disabled under `prefers-reduced-motion` (see the block in `globals.css`).
