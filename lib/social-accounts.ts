import type { SocialPlatform } from "@/lib/agents/iafluencer-rules";
import type { TokenSet } from "@/lib/agents/iafluencer";
import { decryptSecret, encryptSecret } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";

// Propriétaire des comptes : l'administrateur unique du Hub (il n'existe pas encore de modèle utilisateur).
export const ADMIN_OWNER_ID = "admin";

const KEY = (platform: SocialPlatform) => ({ ownerId_platform: { ownerId: ADMIN_OWNER_ID, platform } });

/** Profil public du compte, lu à la connexion. */
export type SocialProfile = { externalId: string | null; accountName: string | null; avatarUrl: string | null };

/** Enregistre (ou remplace) le compte relié. Les jetons sont chiffrés avant écriture. */
export async function saveSocialAccount(platform: SocialPlatform, tokens: TokenSet, profile: SocialProfile): Promise<void> {
  const data = {
    accessToken: encryptSecret(tokens.accessToken),
    refreshToken: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
    expiresAt: tokens.expiresInSec ? new Date(Date.now() + tokens.expiresInSec * 1000) : null,
    ...profile,
  };
  await prisma.socialAccount.upsert({
    where: KEY(platform),
    create: { ownerId: ADMIN_OWNER_ID, platform, ...data },
    update: data,
  });
}

/** Met à jour les jetons après un rafraîchissement. Le profil n'est pas modifié. */
export async function updateSocialTokens(platform: SocialPlatform, tokens: TokenSet): Promise<void> {
  await prisma.socialAccount.update({
    where: KEY(platform),
    data: {
      accessToken: encryptSecret(tokens.accessToken),
      refreshToken: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : undefined,
      expiresAt: tokens.expiresInSec ? new Date(Date.now() + tokens.expiresInSec * 1000) : null,
    },
  });
}

/** Jetons déchiffrés d'un compte relié, ou null. Réservé au serveur : ne jamais les renvoyer au navigateur. */
export async function readSocialTokens(platform: SocialPlatform): Promise<{ accessToken: string; refreshToken: string | null } | null> {
  const row = await prisma.socialAccount.findUnique({ where: KEY(platform), select: { accessToken: true, refreshToken: true } });
  if (!row) return null;
  return {
    accessToken: decryptSecret(row.accessToken),
    refreshToken: row.refreshToken ? decryptSecret(row.refreshToken) : null,
  };
}

/** Comptes reliés, avec leur profil public. Ne lit jamais les jetons. */
export async function connectedAccounts(): Promise<Map<SocialPlatform, SocialProfile>> {
  const rows = await prisma.socialAccount.findMany({
    where: { ownerId: ADMIN_OWNER_ID },
    select: { platform: true, externalId: true, accountName: true, avatarUrl: true },
  });
  return new Map(rows.map((row) => [row.platform as SocialPlatform, { externalId: row.externalId, accountName: row.accountName, avatarUrl: row.avatarUrl }]));
}

/**
 * Supprime le compte relié. Renvoie le jeton d'accès déchiffré, pour une révocation chez le fournisseur,
 * ou null si le déchiffrement échoue : la suppression en base a de toute façon eu lieu.
 */
export async function removeSocialAccount(platform: SocialPlatform): Promise<string | null> {
  const row = await prisma.socialAccount.findUnique({ where: KEY(platform), select: { accessToken: true } });
  if (!row) return null;
  await prisma.socialAccount.delete({ where: KEY(platform) });
  try {
    return decryptSecret(row.accessToken);
  } catch {
    return null;
  }
}
