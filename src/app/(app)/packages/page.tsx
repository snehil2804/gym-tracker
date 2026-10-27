"use client";

import { ArrowRight, Package, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { Badge, Card, EmptyState, ErrorNote, LinkButton, PageHeader, ProgressBar, Skeleton, PtOffNotice } from "@/components/ui";
import { useCore } from "@/lib/data/derived";
import { formatDate } from "@/lib/domain/dates";
import { formatMoney, sessionValue } from "@/lib/domain/money";
import { packageState } from "@/lib/domain/packages";

export default function PackagesPage() {
  const { data: d, loading, error } = useCore();
  if (error) return <ErrorNote error={error} />;
  if (loading || !d) return <Skeleton className="h-96" />;
  if (!d.ptEnabled) return <PtOffNotice />;
  const current = d.current;

  return (
    <div className="anim-rise">
      <PageHeader
        title="PT Packages"
        subtitle="Every package keeps its own price, rate and history. Renewing never changes an older package."
        actions={
          <>
            {current && (
              <LinkButton href={`/packages/new?renew=${current.id}`} variant="primary" icon={<RefreshCw className="size-4" />}>
                Renew PT package
              </LinkButton>
            )}
            <LinkButton href="/packages/new" icon={<Plus className="size-4" />}>
              New package
            </LinkButton>
          </>
        }
      />

      {d.packages.length === 0 ? (
        <Card>
          <EmptyState icon={<Package className="size-5" />} title="No packages yet" action={<LinkButton href="/packages/new" variant="primary">Add your first package</LinkButton>}>
            Add the PT package you paid for to start tracking sessions and value.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {d.packages.map((p) => {
            const st = packageState(p, d.today);
            const total = p.sessions_purchased + p.credited + p.transferred_in + p.adjusted;
            return (
              <Link key={p.id} href={`/packages/${p.id}`} className="group">
                <Card className="h-full p-5 transition-colors group-hover:border-line-strong">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-muted">
                        {formatDate(p.start_date)}
                        {p.closed_on ? ` – ${formatDate(p.closed_on)}` : p.expiry_date ? ` – expires ${formatDate(p.expiry_date)}` : ""}
                      </p>
                      <h2 className="mt-0.5 truncate text-[17px] font-semibold">
                        {p.trainer_name}
                        {p.label && <span className="font-normal text-muted"> · {p.label}</span>}
                      </h2>
                    </div>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </div>
                  <p className="num mt-4 font-display text-3xl font-semibold">
                    {p.remaining}
                    <span className="ml-1.5 text-sm font-medium text-muted">/ {total} left</span>
                  </p>
                  <ProgressBar
                    className="mt-3"
                    total={total}
                    segments={[
                      { value: p.completed, className: "bg-good", label: "Completed" },
                      { value: p.forfeited + p.expired, className: "bg-accent", label: "Missed" },
                      { value: p.refunded + p.transferred_out, className: "bg-info", label: "Refunded / moved" },
                    ]}
                  />
                  <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted">Price</dt>
                      <dd className="num font-semibold">{formatMoney(p.price_paise)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Per session</dt>
                      <dd className="num font-semibold">{formatMoney(sessionValue(1, p.price_paise, p.sessions_purchased))}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Paid</dt>
                      <dd className={`num font-semibold ${p.outstanding_paise > 0 ? "text-warn" : ""}`}>{formatMoney(p.paid_paise)}</dd>
                    </div>
                  </dl>
                  <p className="mt-4 flex items-center gap-1 text-sm font-medium text-muted group-hover:text-ink">
                    {p.completed} completed · {p.forfeited} missed · {p.trainer_cancelled} cancelled <ArrowRight className="ml-auto size-4" />
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
