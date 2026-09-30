import { prisma } from '@/lib/db/prisma'

/**
 * Résolution ville → identifiant AMEEX.
 *
 * L'API AMEEX attend un identifiant dans le champ `city`, pas un nom libre
 * (`ameex-api-simplified.json`, endpoint Add : "city id (required)"). Les
 * formulaires restent en saisie libre, la correspondance est gérée ici et
 * dans l'écran Paramètres → Villes de l'administrateur.
 *
 * La correspondance ignore casse, accents et espaces superflus, ce qui évite
 * qu'un «Casablanca » et un « Casablanca » soient traités comme deux villes.
 */

export interface ResolvedCity {
  id: string
  name: string
  ameexId: string
}

export function normalizeCityName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase()
}

export class UnknownCityError extends Error {
  constructor(readonly cityName: string) {
    super(
      `La ville « ${cityName} » n'est pas rattachée à un identifiant AMEEX. L'administrateur doit l'associer dans Paramètres → Villes avant de créer l'expédition.`
    )
    this.name = 'UnknownCityError'
  }
}

/** Recherche une ville par son nom, en ignorant casse et accents. */
export async function resolveCity(cityName: string): Promise<ResolvedCity | null> {
  const needle = normalizeCityName(cityName)
  if (!needle) return null

  const cities = await prisma.city.findMany({
    where: { isActive: true },
    select: { id: true, name: true, ameexId: true },
  })

  const exact = cities.find((city) => normalizeCityName(city.name) === needle)
  if (exact) return exact

  // Repli : correspondance par préfixe, pratique pour « Casablanca » vs
  // « Casablanca Marina » tant que l'administrateur n'a pas renamed.
  const prefixed = cities.find((city) => {
    const normalized = normalizeCityName(city.name)
    return normalized.startsWith(needle) || needle.startsWith(normalized)
  })

  return prefixed ?? null
}

/** Variante stricte : lève une erreur explicite si la ville n'est pas mappée. */
export async function resolveCityOrThrow(cityName: string): Promise<ResolvedCity> {
  const city = await resolveCity(cityName)
  if (!city) throw new UnknownCityError(cityName)
  return city
}