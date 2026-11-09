"use client";

import dynamic from "next/dynamic";
import { HubLoader } from "@/components/ui/HubLoader";

// Le moteur 3D (three, React Three Fiber, drei) n'est chargé que dans le navigateur, après l'affichage de la page :
// il ne retarde ni le rendu serveur ni le LCP. Le conteneur a une hauteur fixe pour éviter tout décalage (CLS).
const HubScene = dynamic(() => import("./HubScene").then((module) => module.HubScene), {
  ssr: false,
  loading: () => <HubLoader />,
});

export function HubView() {
  return (
    <div className="relative h-[75vh] min-h-[600px] w-full overflow-hidden bg-slate-50">
      <HubScene />
    </div>
  );
}
