import {
  encryptSecret,
  decryptSecret,
  isSecretEncrypted,
  isEncryptionConfigured,
  maskSecret,
  safeEqual,
} from '@/lib/crypto/secrets'
import { escapeCsvValue, toCsv } from '@/lib/utils/csv'
import { normalizeCityName } from '@/lib/ameex/cities'
import { slugify } from '@/lib/products/schema'

const VALID_KEY = 'a'.repeat(64)

describe('chiffrement des secrets AMEEX (§6.5)', () => {
  const originalKey = process.env.AMEEX_ENCRYPTION_KEY

  beforeEach(() => {
    process.env.AMEEX_ENCRYPTION_KEY = VALID_KEY
  })

  afterAll(() => {
    process.env.AMEEX_ENCRYPTION_KEY = originalKey
  })

  it('refuse d\'écrire quand aucune clé n\'est configurée', () => {
    delete process.env.AMEEX_ENCRYPTION_KEY

    expect(isEncryptionConfigured()).toBe(false)
    expect(() => encryptSecret('secret-value')).toThrow(/AMEEX_ENCRYPTION_KEY/)
  })

  it('refuse une clé de longueur incorrecte', () => {
    process.env.AMEEX_ENCRYPTION_KEY = 'trop-court'

    expect(isEncryptionConfigured()).toBe(false)
    expect(() => encryptSecret('secret-value')).toThrow(/64 caractères hexadécimaux/)
  })

  it('fait un aller-retour fidèle', () => {
    const plaintext = 'C-Api-Key-super-secret'
    const encrypted = encryptSecret(plaintext) as string

    expect(isSecretEncrypted(encrypted)).toBe(true)
    expect(encrypted).not.toContain(plaintext)
    expect(decryptSecret(encrypted)).toBe(plaintext)
  })

  it('produit un résultat différent à chaque appel (IV aléatoire)', () => {
    const first = encryptSecret('même-valeur') as string
    const second = encryptSecret('même-valeur') as string

    expect(first).not.toBe(second)
    expect(decryptSecret(first)).toBe(decryptSecret(second))
  })

  it('ne double-chiffre pas une valeur déjà chiffrée', () => {
    const once = encryptSecret('valeur') as string

    expect(encryptSecret(once)).toBe(once)
  })

  it('rejette un texte chiffré altéré', () => {
    const encrypted = encryptSecret('valeur') as string
    const tampered = `${encrypted.slice(0, -4)}AAAA`

    expect(() => decryptSecret(tampered)).toThrow()
  })

  it('rejette un texte chiffré avec une mauvaise clé', () => {
    const encrypted = encryptSecret('valeur') as string
    process.env.AMEEX_ENCRYPTION_KEY = 'b'.repeat(64)

    expect(() => decryptSecret(encrypted)).toThrow()
  })

  it('reste lisible pour une valeur historique non chiffrée', () => {
    // Migration progressive : une ligne en clair doit rester déchiffrable.
    expect(decryptSecret('ancien-clair')).toBe('ancien-clair')
  })

  it('traite les valeurs vides comme nulles', () => {
    expect(encryptSecret('')).toBeNull()
    expect(encryptSecret(null)).toBeNull()
    expect(decryptSecret(null)).toBeNull()
  })
})

describe('masquage des secrets', () => {
  it('ne divulgue que les derniers caractères', () => {
    expect(maskSecret('ABCDEFGH1234')).toBe('••••••••1234')
    expect(maskSecret('ABCDEFGH1234')).not.toContain('ABCDEFGH')
  })

  it('ne révèle rien des secrets courts', () => {
    expect(maskSecret('ab')).toBe('••••')
    expect(maskSecret('')).toBe('')
    expect(maskSecret(null)).toBe('')
  })
})

describe('comparaison à temps constant', () => {
  it('compare correctement', () => {
    expect(safeEqual('token', 'token')).toBe(true)
    expect(safeEqual('token', 'autre')).toBe(false)
  })

  it('refuse des longueurs différentes sans lever', () => {
    expect(safeEqual('court', 'beaucoup-plus-long')).toBe(false)
  })
})

describe('export CSV (§8)', () => {
  it('échappe le séparateur de champ et les guillemets', () => {
    expect(escapeCsvValue('simple')).toBe('simple')
    // La virgule n'est pas le séparateur : elle n'a pas besoin d'être échappée.
    expect(escapeCsvValue('avec, virgule')).toBe('avec, virgule')
    expect(escapeCsvValue('avec ; point-virgule')).toBe('"avec ; point-virgule"')
    expect(escapeCsvValue('avec "guillemets"')).toBe('"avec ""guillemets"""')
    expect(escapeCsvValue('sur\ndeux lignes')).toBe('"sur\ndeux lignes"')
  })

  it('produit un en-tête et des lignes cohérentes', () => {
    const csv = toCsv(
      [
        { key: 'name', label: 'Nom' },
        { key: 'amount', label: 'Montant' },
      ],
      [
        { name: 'Alpha', amount: 10 },
        { name: 'Beta; Gamma', amount: 20 },
      ]
    )

    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('Nom;Montant')
    expect(lines[1]).toBe('Alpha;10')
    expect(lines[2]).toBe('"Beta; Gamma";20')
  })

  it('sérialise les dates en ISO', () => {
    const date = new Date('2026-09-30T12:00:00.000Z')
    expect(escapeCsvValue(date)).toBe('2026-09-30T12:00:00.000Z')
  })
})

describe('normalisation des villes', () => {
  it('ignore casse, accents et espaces superflus', () => {
    expect(normalizeCityName('Casablanca')).toBe('casablanca')
    expect(normalizeCityName('  CASABLANCA ')).toBe('casablanca')
    expect(normalizeCityName('Témara')).toBe('temara')
    expect(normalizeCityName('Casablanca-Marina')).toBe('casablanca marina')
  })
})

describe('slug de produit', () => {
  it('produit un slug ASCII à partir d\'un nom libre', () => {
    expect(slugify('Lampe Design 3D — Éclairage')).toBe('lampe-design-3d-eclairage')
    expect(slugify('  Support Téléphone  ')).toBe('support-telephone')
  })

  it('ne produit jamais de chaîne vide pour un nom accentué', () => {
    expect(slugify('É')).not.toBe('')
  })
})