export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(135deg,var(--dashboard-hero-start),var(--dashboard-hero-middle),var(--dashboard-hero-end))] p-5 shadow-[0_18px_40px_-28px_var(--primary)] sm:p-6">
      <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.42),transparent_65%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent_65%)]" />
      <div className="max-w-3xl space-y-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase">
          Dashboard
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Overview
        </h1>
        <p className="max-w-2xl text-sm text-foreground/80 sm:text-base">
          Adjust filters and explore sales by location below. Other tools are in
          the sidebar.
        </p>
      </div>
    </section>
  );
}
