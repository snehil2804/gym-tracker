export function PageFallback() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 md:pl-64" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-48 animate-pulse rounded-xl bg-surface-2" />
      <div className="mt-6 h-28 animate-pulse rounded-2xl bg-surface-2" />
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="h-64 animate-pulse rounded-2xl bg-surface-2 lg:col-span-2" />
        <div className="h-64 animate-pulse rounded-2xl bg-surface-2" />
      </div>
    </div>
  );
}
