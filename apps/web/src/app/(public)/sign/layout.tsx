/** Full-bleed signing — no card chrome from the public layout wrapper. */
export default function SignLayout({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 flex flex-col bg-slate-200 dark:bg-slate-900">{children}</div>;
}
