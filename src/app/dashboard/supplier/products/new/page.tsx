'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import Link from 'next/link'

const productSchema = z.object({
  name: z.string().min(3, 'Le nom doit contenir au moins 3 caractères').max(100),
  slug: z.string().min(3, 'Le slug doit contenir au moins 3 caractères').max(100).regex(/^[a-z0-9-]+$/, 'Slug invalide (lettres minuscules, chiffres, tirets uniquement)'),
  categoryId: z.string().min(1, 'Veuillez sélectionner une catégorie'),
  description: z.string().min(20, 'La description doit contenir au moins 20 caractères'),
  shortDescription: z.string().max(200).optional(),
  supplierPrice: z.coerce.number().min(0.01, 'Le prix doit être supérieur à 0'),
  productionDays: z.coerce.number().min(1, 'Minimum 1 jour').max(60, 'Maximum 60 jours'),
  weight: z.coerce.number().min(0).optional(),
  length: z.coerce.number().min(0).optional(),
  width: z.coerce.number().min(0).optional(),
  height: z.coerce.number().min(0).optional(),
  status: z.enum(['DRAFT', 'ACTIVE']),
})

type ProductForm = z.infer<typeof productSchema>

const categories = [
  { id: '1', name: 'Accessoires' },
  { id: '2', name: 'Électronique' },
  { id: '3', name: 'Décoration' },
  { id: '4', name: 'Organisation' },
  { id: '5', name: 'Jouets' },
  { id: '6', name: 'Outils' },
  { id: '7', name: 'Autre' },
]

export default function NewProductPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
    setValue,
  } = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      status: 'DRAFT',
      productionDays: 5,
    },
  })

  const name = watch('name')

  // Auto-generate slug from name
  const handleNameChange = (value: string) => {
    setValue('name', value, { shouldValidate: true })
    const slug = value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
    setValue('slug', slug, { shouldValidate: true })
  }

  const onSubmit = async (data: ProductForm) => {
    setIsSubmitting(true)
    setError(null)

    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 1000))
      router.push('/dashboard/supplier/products')
      router.refresh()
    } catch {
      setError('Erreur lors de la création du produit')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/supplier/products" className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nouveau produit</h1>
          <p className="text-gray-500">Ajoutez un produit à votre catalogue</p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>Informations de base</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Nom du produit *</Label>
                <Input
                  id="name"
                  placeholder="ex: Support téléphone réglable"
                  {...register('name', { onChange: handleNameChange })}
                  error={errors.name?.message}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Slug (URL) *</Label>
                <Input
                  id="slug"
                  placeholder="support-telephone-reglable"
                  {...register('slug')}
                  error={errors.slug?.message}
                  disabled={isSubmitting}
                  helperText="Généré automatiquement depuis le nom"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="categoryId">Catégorie *</Label>
              <Select
                value={watch('categoryId')}
                onValueChange={(value) => setValue('categoryId', value, { shouldValidate: true })}
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner une catégorie" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.categoryId && <p className="text-sm text-destructive">{errors.categoryId.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description complète *</Label>
              <Textarea
                id="description"
                placeholder="Décrivez votre produit en détail : matériaux, dimensions, usages, particularités..."
                rows={6}
                {...register('description')}
                error={errors.description?.message}
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="shortDescription">Description courte</Label>
              <Textarea
                id="shortDescription"
                placeholder="Résumé pour les listes (max 200 caractères)"
                rows={3}
                maxLength={200}
                {...register('shortDescription')}
                disabled={isSubmitting}
              />
            </div>
          </CardContent>
        </Card>

        {/* Pricing */}
        <Card>
          <CardHeader>
            <CardTitle>Prix et fabrication</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="supplierPrice">Prix fournisseur (MAD) *</Label>
                <Input
                  id="supplierPrice"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="85.00"
                  {...register('supplierPrice')}
                  error={errors.supplierPrice?.message}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="productionDays">Délai fabrication (jours) *</Label>
                <Input
                  id="productionDays"
                  type="number"
                  min="1"
                  max="60"
                  placeholder="5"
                  {...register('productionDays')}
                  error={errors.productionDays?.message}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Statut *</Label>
                <Select
                  value={watch('status')}
                  onValueChange={(value) => setValue('status', value as 'DRAFT' | 'ACTIVE', { shouldValidate: true })}
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">Brouillon</SelectItem>
                    <SelectItem value="ACTIVE">Actif</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Dimensions (for shipping) */}
        <Card>
          <CardHeader>
            <CardTitle>Dimensions et poids (pour l'expédition)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-500">Ces informations sont utilisées pour calculer les frais d'expédition AMEEX</p>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="weight">Poids (kg)</Label>
                <Input
                  id="weight"
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="0.150"
                  {...register('weight')}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="length">Longueur (cm)</Label>
                <Input
                  id="length"
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="15"
                  {...register('length')}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="width">Largeur (cm)</Label>
                <Input
                  id="width"
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="10"
                  {...register('width')}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="height">Hauteur (cm)</Label>
                <Input
                  id="height"
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="5"
                  {...register('height')}
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
          <Link href="/dashboard/supplier/products">
            <Button variant="outline">Annuler</Button>
          </Link>
          <Button type="submit" loading={isSubmitting}>
            <Save className="h-4 w-4 mr-2" />
            {isSubmitting ? 'Création...' : 'Créer le produit'}
          </Button>
        </div>
      </form>
    </div>
  )
}