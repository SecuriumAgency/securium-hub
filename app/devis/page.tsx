import type { Metadata } from "next";
import Image from "next/image";
import { DynamicLeadFunnel } from "@/components/public/DynamicLeadFunnel";
import { sanitizeNiche, sanitizeRegion } from "@/lib/public-leads-rules";

// Page publique de capture : ni menu, ni données du dashboard, pas indexée.
export const metadata: Metadata = {
  title: "Demande de devis · Securium",
  robots: { index: false, follow: false },
};

// Lu à chaque visite : la niche et le département viennent de l'URL.
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Exemples : /devis?niche=isolation&region=95
export default async function DevisPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const niche = sanitizeNiche(first(params.niche));
  const region = sanitizeRegion(first(params.region));

  return (
    <main className="flex min-h-dvh flex-col items-center bg-slate-950 px-4 py-8 text-slate-100">
      <div className="flex w-full max-w-xl flex-col items-center gap-6">
        <Image
          src="/logo/securium-logo.png"
          alt="Securium"
          width={72}
          height={72}
          priority
          className="size-18 rounded-2xl border border-amber-400/30 bg-slate-900 object-contain p-2"
        />
        <DynamicLeadFunnel niche={niche} region={region} />
        <p className="text-center text-xs text-slate-500">
          Vos informations servent uniquement à vous recontacter au sujet de votre demande.
        </p>
      </div>
    </main>
  );
}
