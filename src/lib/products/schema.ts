import { z } from 'zod'

/** Schéma de création/modification d'un produit (§5.4). */
export const productInputSchema = z.object({
  name: z.string().min(3, 'Le nom doit contenir au moins 3 caractères').max(120),
  slug: z
    .string()
    .min(3)
    .max(120)
    .regex(/^[a-z0-9-]+$/, 'Slug invalide (minuscules, chiffres et tirets uniquement)')
    .optional(),
  categoryId: z.string().min(1, 'Veuillez sélectionner une catégorie'),
  supplierId: z.string().optional(),
  description: z.string().min(20, 'La description doit contenir au moins 20 caractères'),
  shortDescription: z.string().max(300).optional(),
  supplierPrice: z.coerce.number().positive('Le prix doit être supérieur à 0'),
  currency: z.string().default('MAD'),
  productionDays: z.coerce.number().int().min(1, 'Minimum 1 jour').max(90, 'Maximum 90 jours'),
  weight: z.coerce.number().positive().optional(),
  length: z.coerce.number().positive().optional(),
  width: z.coerce.number().positive().optional(),
  height: z.coerce.number().positive().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'DISABLED']).default('DRAFT'),
  isFeatured: z.boolean().default(false),
  imageUrls: z.array(z.string().min(1)).max(8).default([]),
})

export const productPatchSchema = productInputSchema.partial().extend({
  id: z.string().optional(),
})

export type ProductInput = z.infer<typeof productInputSchema>

/** Slug ASCII à partir d'un nom libre : « Lampe Design 3D » → `lampe-design-3d`. */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
}