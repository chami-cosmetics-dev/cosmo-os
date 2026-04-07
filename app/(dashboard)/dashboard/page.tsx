export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <section className="from-primary/10 to-background relative overflow-hidden rounded-2xl border bg-gradient-to-r p-5 sm:p-6">
      <div className="max-w-3xl space-y-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase">
          Dashboard 2
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Overview
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          Adjust filters and explore sales by location below. Other tools are in
          the sidebar.
        </p>
      </div>
    </section>
  );
}
