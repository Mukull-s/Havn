"use client";

export function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading clinic dashboard">
      <div className="grid grid-cols-2 divide-x divide-[var(--border-hairline)] rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="px-4 py-3.5">
            <div className="h-3 w-20 animate-pulse rounded bg-[var(--bg-hover)]" />
            <div className="mt-2 h-6 w-10 animate-pulse rounded bg-[var(--bg-subtle)]" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
        <div className="border-b border-[var(--border-hairline)] px-5 py-4">
          <div className="h-5 w-44 animate-pulse rounded bg-[var(--bg-hover)]" />
        </div>
        <div className="divide-y divide-[var(--border-hairline)]">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="flex items-center justify-between gap-4 px-5 py-4"
            >
              <div className="space-y-2">
                <div className="h-4 w-36 animate-pulse rounded bg-[var(--bg-hover)]" />
                <div className="h-3 w-24 animate-pulse rounded bg-[var(--bg-subtle)]" />
              </div>
              <div className="h-6 w-20 animate-pulse rounded-full bg-[var(--bg-subtle)]" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4"
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 animate-pulse rounded-full bg-[var(--bg-hover)]" />
              <div className="space-y-1.5">
                <div className="h-4 w-32 animate-pulse rounded bg-[var(--bg-hover)]" />
                <div className="h-3 w-20 animate-pulse rounded bg-[var(--bg-subtle)]" />
              </div>
            </div>
            <div className="mt-4 h-7 w-full animate-pulse rounded bg-[var(--bg-subtle)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
