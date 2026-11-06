import type { Metadata } from "next";
import Image from "next/image";
import { BuyerDeclarationForm } from "@/components/public/BuyerDeclarationForm";
import { isDeclarationNiche, type DeclarationNiche } from "@/lib/broker/declaration-rules";
import { readDeclarationToken } from "@/lib/broker/declaration-token";
import { canonicalNiche } from "@/lib/broker/matching";
import { prisma } from "@/lib/prisma";

// Page du lien de déclaration : ni menu, ni données du Hub, pas indexée.
export const metadata: Metadata = {
  title: "Vos critères · Securium",
  robots: { index: false, follow: false },
};

// Lu à chaque visite : le jeton et les critères peuvent changer.
export const dynamic = "force-dynamic";

type Params = Promise<{ token: string }>;

export default async function PartenairePage({ params }: { params: Params }) {
  const { token } = await params;
  // Sans jeton valide, rien n'est lu en base : la page ne révèle ni l'existence ni le nom d'un prospect.
  const prospectId = await readDeclarationToken(token);
  const prospect = prospectId
    ? await prisma.outreachProspect.findUnique({
        where: { id: prospectId },
        select: { company: true, targetNiches: true, targetZipCodes: true },
      })
    : null;

  // Les anciennes formes (« couverture », « pac ») s'affichent sous leur niche canonique.
  const initialNiches = (prospect?.targetNiches ?? []).map(canonicalNiche).filter(isDeclarationNiche) as DeclarationNiche[];

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
        {prospect ? (
          <BuyerDeclarationForm
            token={token}
            company={prospect.company}
            initialNiches={initialNiches}
            initialZones={prospect.targetZipCodes}
          />
        ) : (
          <section className="glass-panel w-full rounded-3xl p-6 text-center md:p-8">
            <h1 className="text-xl font-semibold text-slate-100">Lien invalide ou expiré</h1>
            <p className="mt-2 text-sm text-slate-400">Demandez un nouveau lien à Securium pour renseigner vos métiers et vos zones.</p>
          </section>
        )}
      </div>
    </main>
  );
}
