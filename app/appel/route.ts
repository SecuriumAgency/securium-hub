import { NextResponse, type NextRequest } from "next/server";

// Lien « Appeler » des notifications Discord (lib/lead-contact.ts) : Discord n'ouvre que les liens
// http(s), cette route renvoie vers tel:. Publique (voir middleware.ts) : le téléphone de l'artisan
// n'a pas de session Hub. Elle ne lit aucune donnée : elle redirige vers le numéro reçu, accepté
// seulement au format E.164, donc jamais vers un site.
export function GET(request: NextRequest) {
  const number = request.nextUrl.searchParams.get("n") ?? "";
  if (!/^\+[1-9]\d{7,14}$/.test(number)) {
    return new NextResponse("Numéro invalide.", { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  // Redirection plutôt que page : le clic dans Discord compte comme geste de l'utilisateur, le
  // navigateur ouvre donc le composeur sans demander un second clic.
  return new NextResponse(null, {
    status: 302,
    headers: { Location: `tel:${number}`, "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
