import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { WhoisScanner } from "@/components/dashboard/WhoisScanner";

export const metadata: Metadata = {
  title: "OSINT · Securium Core",
};

export default function OsintPage() {
  return (
    <main className="admin-shell min-h-dvh overflow-x-hidden bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:gap-8 md:p-6">
        <AdminNav />

        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-foreground md:text-4xl">OSINT</h1>
          <p className="text-sm text-muted-foreground">Vérifiez en un clic la disponibilité et l&apos;échéance d&apos;un domaine.</p>
        </header>

        <WhoisScanner />
      </div>
    </main>
  );
}
