// Squelette affiché pendant le chargement du hub 3D : mêmes dimensions que la scène, pour éviter le décalage de mise en page.
export function HubLoader() {
  return (
    <div
      role="status"
      aria-label="Chargement du hub 3D"
      className="flex h-full w-full items-center justify-center bg-slate-950"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="size-14 animate-spin rounded-full border-4 border-slate-200 border-t-slate-500" aria-hidden />
        <p className="animate-pulse text-sm text-slate-500">Chargement du hub 3D…</p>
      </div>
    </div>
  );
}
