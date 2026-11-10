import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { AuditScanner } from "@/components/admin/AuditScanner";
import { PageHeader } from "@/components/admin/PageHeader";

export const metadata: Metadata = {
  title: "Audit B2B · Securium Core",
};

// Moteur d'audit B2B : analyse passive d'un site de prospect. La session est vérifiée par le middleware et par la route API.
export default function AuditPage() {
  return (
    <main className="admin-shell min-h-dvh overflow-x-hidden bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:gap-8 md:p-6">
        <div className="print:hidden">
          <AdminNav />
        </div>

        <div className="print:hidden">
          <PageHeader title="Audit B2B" description="Sécurité, SEO et temps de réponse d'un site de prospect, avec export PDF." />
        </div>

        <AuditScanner />
      </div>
    </main>
  );
}
