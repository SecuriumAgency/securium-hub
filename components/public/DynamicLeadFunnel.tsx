"use client";

import { useState, type FormEvent } from "react";
import { nicheLabel, URGENCIES, type Urgency } from "@/lib/public-leads-rules";

// Tunnel multi-étapes du /devis. La niche et le département viennent de l'URL et adaptent le texte.
type Props = { niche: string | null; region: string | null };
type Step = 1 | 2 | 3;

const FIELD =
  "w-full min-h-[52px] rounded-xl border border-white/10 bg-slate-900/70 px-4 text-base text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/40";
const PRIMARY =
  "min-h-[52px] w-full rounded-xl bg-amber-400 px-5 text-base font-semibold text-slate-950 transition-all duration-300 hover:bg-amber-300 hover:shadow-[0_0_24px_-6px_rgba(251,191,36,0.65)] focus-visible:outline-2 focus-visible:outline-amber-300 disabled:cursor-not-allowed disabled:opacity-60";
const SECONDARY =
  "min-h-[52px] w-full rounded-xl border border-white/15 bg-white/5 px-5 text-base font-medium text-slate-100 transition-all duration-300 hover:border-amber-400/60 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-amber-300";
const LABEL = "text-sm font-medium text-slate-300";

export function DynamicLeadFunnel({ niche, region }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [urgency, setUrgency] = useState<Urgency | null>(null);
  const [message, setMessage] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  // Accord facultatif : ses coordonnées peuvent être transmises à des artisans partenaires.
  const [shareConsent, setShareConsent] = useState(false);
  // Champ piège : invisible pour une personne, rempli par les robots.
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const title = `Recevez jusqu'à 3 devis pour votre projet de ${nicheLabel(niche)} ${
    region ? `dans le ${region}` : "dans votre département"
  }`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!urgency) return;
    setStatus("sending");
    setError(null);
    try {
      const response = await fetch("/api/leads/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche: niche ?? "travaux",
          region,
          urgency,
          message: message.trim() || undefined,
          postalCode,
          name,
          phone,
          email: email.trim() || undefined,
          consent: true,
          shareConsent,
          website,
        }),
      });
      if (response.ok) {
        setStatus("done");
        return;
      }
      const data = (await response.json().catch(() => ({}))) as { error?: string; details?: string[] };
      setError(data.details?.[0] ?? data.error ?? "Envoi impossible. Réessayez.");
      setStatus("error");
    } catch {
      setError("Connexion impossible. Vérifiez votre réseau et réessayez.");
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <section aria-live="polite" className="glass-panel w-full rounded-3xl p-6 text-center md:p-8">
        <p className="text-3xl" aria-hidden="true">✅</p>
        <h2 className="mt-3 text-xl font-semibold text-slate-100">Votre demande est bien envoyée</h2>
        <p className="mt-2 text-sm text-slate-400">Un professionnel vous recontacte rapidement, au numéro indiqué.</p>
      </section>
    );
  }

  return (
    <section className="glass-panel w-full rounded-3xl p-5 md:p-8">
      <h1 className="text-2xl font-semibold leading-tight text-slate-50 md:text-3xl">{title}</h1>

      <ol aria-label="Étapes du formulaire" className="mt-5 flex gap-2">
        {[1, 2, 3].map((value) => (
          <li
            key={value}
            aria-current={step === value ? "step" : undefined}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${value <= step ? "bg-amber-400" : "bg-white/10"}`}
          />
        ))}
      </ol>
      <p className="mt-2 text-xs text-slate-500">Étape {step} sur 3</p>

      {step === 1 && (
        <fieldset className="mt-6 flex flex-col gap-3">
          <legend className="mb-2 text-base font-semibold text-slate-100">Quand souhaitez-vous démarrer ?</legend>
          {(Object.keys(URGENCIES) as Urgency[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setUrgency(value);
                setStep(2);
              }}
              className={`${SECONDARY} ${urgency === value ? "border-amber-400 bg-amber-400/10" : ""}`}
            >
              {URGENCIES[value]}
            </button>
          ))}
        </fieldset>
      )}

      {step === 2 && (
        <div className="mt-6 flex flex-col gap-4">
          <label htmlFor="message" className="text-base font-semibold text-slate-100">
            Décrivez votre besoin en quelques mots <span className="font-normal text-slate-500">(facultatif)</span>
          </label>
          <textarea
            id="message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={500}
            rows={4}
            placeholder="Surface, type de logement, contraintes particulières…"
            className={`${FIELD} min-h-[120px] py-3`}
          />
          <button type="button" onClick={() => setStep(3)} className={PRIMARY}>
            Continuer
          </button>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setStep(1)} className={SECONDARY}>
              Retour
            </button>
            <button type="button" onClick={() => setStep(3)} className={SECONDARY}>
              Passer
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <form onSubmit={submit} className="mt-6 flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <label htmlFor="postalCode" className={LABEL}>
              Code postal du projet
            </label>
            <input
              id="postalCode"
              name="postalCode"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={5}
              required
              value={postalCode}
              onChange={(event) => setPostalCode(event.target.value.replace(/\D/g, ""))}
              className={FIELD}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="name" className={LABEL}>
              Nom
            </label>
            <input
              id="name"
              name="name"
              autoComplete="name"
              required
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={FIELD}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="phone" className={LABEL}>
              Téléphone
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className={FIELD}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="email" className={LABEL}>
              E-mail <span className="font-normal text-slate-500">(facultatif)</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={120}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={FIELD}
            />
          </div>

          {/* Champ piège, hors de la vue et de la navigation au clavier. */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            className="absolute -left-[9999px] h-0 w-0 opacity-0"
          />

          <label className="flex items-start gap-3 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              required
              className="mt-1 size-5 shrink-0 accent-amber-400"
            />
            <span>J&apos;accepte d&apos;être recontacté au sujet de ma demande de devis.</span>
          </label>

          <label className="flex items-start gap-3 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={shareConsent}
              onChange={(event) => setShareConsent(event.target.checked)}
              className="mt-1 size-5 shrink-0 accent-amber-400"
            />
            <span>
              J&apos;accepte que mes coordonnées soient transmises à des artisans partenaires de ma région, pour recevoir d&apos;autres devis (facultatif).
            </span>
          </label>

          {error && (
            <p role="alert" className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </p>
          )}

          <button type="submit" disabled={!consent || status === "sending"} className={PRIMARY}>
            {status === "sending" ? "Envoi en cours…" : "Recevoir mes devis"}
          </button>
          <button type="button" onClick={() => setStep(2)} className={SECONDARY}>
            Retour
          </button>
        </form>
      )}
    </section>
  );
}
