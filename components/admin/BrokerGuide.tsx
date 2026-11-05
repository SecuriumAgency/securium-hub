// Explication du Lead Broker, en quatre étapes, affichée en haut de la page. Statique : aucun chiffre venu de la base.
const STEPS = [
  {
    title: "Le lead entre",
    text: "Une personne remplit le formulaire /devis : niche, ville, urgence. Son lead n'est vendable que si elle a accepté la cession de ses données (case de consentement).",
  },
  {
    title: "Le matching",
    text: "Un acheteur est compatible si sa niche ET sa zone couvrent le lead. Code postal exact : 100 %. Même département : 80 %. Si une des deux conditions manque, aucune correspondance.",
  },
  {
    title: "Le prix",
    text: "Grille 20 / 45 / 90 € selon la qualité du lead. +30 % pour une PAC ou une toiture complète, −10 % dès 10 leads dans un même lot. Le prix reste modifiable au moment de la vente.",
  },
  {
    title: "La vente",
    text: "Vous cochez les leads, choisissez un acheteur compatible, puis un prix à l'unité ou par lot. Le lot part en « En attente de paiement » jusqu'à ce que vous le marquiez payé.",
  },
];

export function BrokerGuide() {
  return (
    <section aria-labelledby="broker-guide" className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 md:p-5">
      <div className="flex flex-col gap-1">
        <h2 id="broker-guide" className="text-lg font-semibold text-foreground">
          Comment fonctionne le Lead Broker
        </h2>
        <p className="text-sm text-muted-foreground">Un lead consenti est proposé à l&apos;acheteur dont la niche et la zone correspondent, puis vendu.</p>
      </div>

      <ol className="grid gap-3 md:grid-cols-4">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex flex-col gap-2 rounded-xl border border-border bg-muted/40 p-4">
            <span className="inline-flex size-7 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-sm font-semibold tabular-nums text-primary">
              {index + 1}
            </span>
            <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">{step.text}</p>
          </li>
        ))}
      </ol>

      <p className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-foreground">
        <span className="font-semibold text-primary">Exemple : </span>
        un lead « isolation » à Chilly-Mazarin (91) correspond à Geo Energy Habitat à 80 %, car le client couvre la niche isolation et le département 91.
        Un lead « toiture » dans le 95 ne lui correspond pas : la niche n&apos;est pas couverte.
      </p>
    </section>
  );
}
