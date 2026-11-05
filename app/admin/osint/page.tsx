import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { PageHeader } from "@/components/admin/PageHeader";
import { WhoisScanner } from "@/components/dashboard/WhoisScanner";

export const metadata: Metadata = {
  title: "OSINT · Securium Core",
};

export default function OsintPage() {
  return (
    <main className="admin-shell min-h-dvh overflow-x-hidden bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:gap-8 md:p-6">
        <AdminNav />

        <PageHeader title="OSINT" description="Vérifiez en un clic la disponibilité et l'échéance d'un domaine." />

        <WhoisScanner />
      </div>
    </main>
  );
}
