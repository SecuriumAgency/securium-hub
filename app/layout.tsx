import type { Metadata } from "next";
import { Geist_Mono, Inter, Syne } from "next/font/google";
import "./globals.css";
import ChatwootWidget from "@/components/ChatwootWidget";

// Polices de la charte Securium Agency : Inter pour le texte, Syne pour les titres (classe admin-shell).
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Adresse de production du hub : base des URL absolues (Open Graph, canonical).
const HUB_URL = "https://hub.securium-agency.fr";
const DESCRIPTION = "Centre de commandement 3D de Securium Agency : flotte de sites, leads et agents.";

export const metadata: Metadata = {
  metadataBase: new URL(HUB_URL),
  title: "Securium Core",
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    locale: "fr_FR",
    siteName: "Securium Core",
    title: "Securium Core",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: "Securium Core",
    description: DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body
        className={`${inter.variable} ${syne.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <ChatwootWidget />
      </body>
    </html>
  );
}
