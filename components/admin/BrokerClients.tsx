// Clients du broker (ex. Geo Energy Habitat) : leurs niches, leurs zones et le nombre de leads disponibles qui leur correspondent.
// Composant serveur : aucune interaction, les chiffres viennent de /admin/broker.

export type BrokerClient = {
  id: string;
  company: string;
  city: string | null;
  niches: string[];
  zones: string[];
  compatibleLeads: number;
};

const label = (niche: string) => niche.replace(/-/g, " ");

export function BrokerClients({ clients }: { clients: BrokerClient[] }) {
  return (
    <section aria-labelledby="clients-title" className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
      <div className="flex flex-col gap-1">
        <h2 id="clients-title" className="text-lg font-semibold text-white">
          Clients et leads compatibles
        </h2>
        <p className="text-sm text-slate-400">
          Un client reçoit les leads de ses niches et de ses zones. Le nombre indique les leads disponibles qui lui correspondent.
        </p>
      </div>

      {clients.length === 0 ? (
        <p className="text-sm text-slate-400">Aucun client enregistré.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {clients.map((client) => (
            <li key={client.id} className="flex flex-col gap-2 rounded-xl border border-white/10 p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 break-words font-medium text-white">
                  {client.company}
                  {client.city ? ` · ${client.city}` : ""}
                </p>
                <span
                  className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium tabular-nums ${
                    client.compatibleLeads > 0 ? "border border-emerald-600 bg-emerald-900/50 text-emerald-300" : "border border-slate-600 bg-slate-800 text-slate-400"
                  }`}
                >
                  {client.compatibleLeads} lead{client.compatibleLeads > 1 ? "s" : ""} compatible{client.compatibleLeads > 1 ? "s" : ""}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Niches : {client.niches.length > 0 ? client.niches.map(label).join(", ") : "non renseignées"}
              </p>
              <p className="break-words text-xs text-slate-400">Zones : {client.zones.length > 0 ? client.zones.join(", ") : "non renseignées"}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
