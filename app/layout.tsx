import type { Metadata } from "next";
import { Geist_Mono, Inter, Syne } from "next/font/google";
import "./globals.css";

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

export const metadata: Metadata = {
  title: "Securium Core",
  description: "Centre de commandement 3D de Securium Agency : flotte de sites, leads et agents.",
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
      </body>
    </html>
  );
}
