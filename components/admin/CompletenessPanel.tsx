// Complétude des prospects par système, calculée par lib/broker/completeness.ts. Présentation seule.

type Props = {
  total: number;
  prospecteur: number;
  chasseur: number;
  broker: number;
  matching: number;
};

export function CompletenessPanel({ total, prospecteur, chasseur, broker, matching }: Props) {
  const items = [
    { label: "Prospecteur", hint: "téléphone et e-mail", value: prospecteur },
    { label: "Chasseur", hint: "ville et métier", value: chasseur },
    { label: "Broker", hint: "niches et zones ciblées", value: broker },
    { label: "Matching complet", hint: "les six critères remplis", value: matching },
  ];

  return (
    <section aria-labelledby="completeness-title" className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
      <div className="flex flex-col gap-1">
        <h2 id="completeness-title" className="text-lg font-semibold text-white">
          Complétude des {total} prospects
        </h2>
        <p className="text-sm text-slate-400">
          Part des prospects dont les critères sont remplis, pour chaque système. Le matching complet exige les six critères à la fois.
        </p>
      </div>
      <ul className="grid gap-4 md:grid-cols-4">
        {items.map((item) => (
          <li key={item.label} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm text-slate-200">{item.label}</span>
              <span className="text-lg font-semibold tabular-nums text-amber-200">{item.value} %</span>
            </div>
            <div role="progressbar" aria-label={item.label} aria-valuenow={item.value} aria-valuemin={0} aria-valuemax={100} className="h-2 rounded-full bg-white/10">
              <div className="h-2 rounded-full bg-amber-400" style={{ width: `${item.value}%` }} />
            </div>
            <span className="text-xs text-slate-500">{item.hint}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
