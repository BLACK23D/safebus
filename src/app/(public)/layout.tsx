/** Public auth flows share the aurora backdrop (login/onboarding intro only).
 * Sticky-footer skeleton: min-h-dvh flex column, footer pinned with mt-auto
 * (issue #19) — footer sits at the viewport bottom on short pages and is
 * pushed down naturally when content overflows. */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <div className="aurora" aria-hidden />
      <div className="relative z-10 flex flex-1 flex-col">{children}</div>
      <footer className="relative z-10 mt-auto border-t border-white/10 bg-background/40 backdrop-blur">
        <div
          className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-2 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-xs text-muted-foreground sm:flex-row"
        >
          <p>
            © {new Date().getFullYear()} SafeBus — built for safer school runs.
          </p>
          <nav aria-label="Footer" className="flex items-center gap-4">
            <a
              href="https://github.com/BLACK23D/safebus/blob/main/SECURITY.md"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              Privacy &amp; security
            </a>
            <a
              href="https://github.com/BLACK23D/safebus/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              Report an issue
            </a>
            <a
              href="mailto:deniskelvinmurithi@gmail.com"
              className="transition-colors hover:text-foreground"
            >
              Support
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
