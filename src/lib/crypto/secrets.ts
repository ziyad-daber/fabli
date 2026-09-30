import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'crypto'

/**
 * Chiffrement des secrets au repos (§6.5 du cahier des charges).
 *
 * Les identifiants AMEEX vivent dans `CourierIntegration` et doivent être
 * chiffrés. Format stocké : `v1:<iv>:<tag>:<ciphertext>` (tout en base64).
 *
 * La clé est fournie par `AMEEX_ENCRYPTION_KEY` (64 caractères hexadécimaux =
 * 32 octets). Si elle est absente :
 *   - `encryptSecret` refuse d'écrire en clair (échec explicite) ;
 *   - `decryptSecret` renvoie la valeur telle quelle, ce qui rend les
 *     anciennes lignes en clair encore lisibles et permet une migration
 *     progressive sans downtime.
 */

const ALGORITHM = 'aes-256-gcm'
const PREFIX = 'v1'
const IV_LENGTH = 12

export function isSecretEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(`${PREFIX}:`)
}

export function isEncryptionConfigured(): boolean {
  const key = process.env.AMEEX_ENCRYPTION_KEY
  if (!key) return false
  return /^[0-9a-fA-F]{64}$/.test(key.trim())
}

function getKey(): Buffer {
  const raw = process.env.AMEEX_ENCRYPTION_KEY?.trim()
  if (!raw) {
    throw new Error(
      'AMEEX_ENCRYPTION_KEY est absent. Générez une clé avec "openssl rand -hex 32" avant de stocker des secrets AMEEX.'
    )
  }
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error(
      'AMEEX_ENCRYPTION_KEY est invalide : 64 caractères hexadécimaux attendus (openssl rand -hex 32).'
    )
  }
  return Buffer.from(raw, 'hex')
}

export function encryptSecret(plainText: string | null | undefined): string | null {
  if (plainText === null || plainText === undefined || plainText === '') return null
  // Ne jamais double-chiffrer.
  if (isSecretEncrypted(plainText)) return plainText

  // `getKey` porte les messages d'erreur précis : clé absente vs clé mal
  // formée. On l'appelle avant tout contrôle pour ne pas masquer la cause.
  const key = getKey()

  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [PREFIX, iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':')
}

export function decryptSecret(stored: string | null | undefined): string | null {
  if (stored === null || stored === undefined || stored === '') return null
  // Valeur historique non chiffrée : on la renvoie telle quelle.
  if (!isSecretEncrypted(stored)) return stored
  if (!isEncryptionConfigured()) {
    throw new Error(
      'Impossible de déchiffrer les identifiants AMEEX : AMEEX_ENCRYPTION_KEY est absente ou invalide.'
    )
  }

  const parts = stored.split(':')
  if (parts.length !== 4) {
    throw new Error('Secret AMEEX mal formé : format attendu "v1:<iv>:<tag>:<ciphertext>".')
  }

  const [, ivB64, tagB64, dataB64] = parts
  try {
    const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ])
    return decrypted.toString('utf8')
  } catch {
    throw new Error(
      'Déchiffrement du secret AMEEX impossible : clé incorrecte ou données corrompues.'
    )
  }
}

/**
 * Rend un secret affichable sans le divulguer (§6.5 : les secrets ne sont
 * jamais exposés au navigateur). Ne renvoie que les 4 derniers caractères.
 */
export function maskSecret(value: string | null | undefined): string {
  if (!value) return ''
  if (value.length <= 4) return '••••'
  return `••••••••${value.slice(-4)}`
}

/** Comparaison à temps constant, pour les jetons de réinitialisation. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}