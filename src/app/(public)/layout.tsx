/** Public auth flows share the aurora backdrop (login/onboarding intro only). */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh">
      <div className="aurora" aria-hidden />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
