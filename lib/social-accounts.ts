import type { TokenSet } from "@/lib/agents/iafluencer";
import type { SocialPlatform } from "@/lib/agents/iafluencer-rules";
import { decryptSecret, encryptSecret } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";

// Propriétaire des comptes : l'administrateur unique du Hub (il n'existe pas encore de modèle utilisateur).
export const ADMIN_OWNER_ID = "admin";

/** Enregistre (ou remplace) le compte relié à une plateforme. Les jetons sont chiffrés avant écriture. */
export async function saveSocialAccount(platform: SocialPlatform, tokens: TokenSet, accountName: string | null): Promise<void> {
  const data = {
    accessToken: encryptSecret(tokens.accessToken),
    refreshToken: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
    expiresAt: tokens.expiresInSec ? new Date(Date.now() + tokens.expiresInSec * 1000) : null,
    accountName,
  };
  await prisma.socialAccount.upsert({
    where: { ownerId_platform: { ownerId: ADMIN_OWNER_ID, platform } },
    create: { ownerId: ADMIN_OWNER_ID, platform, ...data },
    update: data,
  });
}

/** Comptes reliés : plateforme et nom d'affichage (sans @), ou null. Ne lit jamais les jetons. */
export async function connectedAccounts(): Promise<Map<SocialPlatform, string | null>> {
  const rows = await prisma.socialAccount.findMany({
    where: { ownerId: ADMIN_OWNER_ID },
    select: { platform: true, accountName: true },
  });
  return new Map(rows.map((row) => [row.platform as SocialPlatform, row.accountName]));
}

/**
 * Supprime le compte relié. Renvoie le jeton d'accès déchiffré, pour une révocation chez le fournisseur,
 * ou null si le déchiffrement échoue : la suppression en base a de toute façon eu lieu.
 */
export async function removeSocialAccount(platform: SocialPlatform): Promise<string | null> {
  const key = { ownerId_platform: { ownerId: ADMIN_OWNER_ID, platform } };
  const row = await prisma.socialAccount.findUnique({ where: key, select: { accessToken: true } });
  if (!row) return null;
  await prisma.socialAccount.delete({ where: key });
  try {
    return decryptSecret(row.accessToken);
  } catch {
    return null;
  }
}
