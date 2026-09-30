'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ArrowLeft, Save, ImagePlus, X, Loader2 } from 'lucide-react'
import Link from 'next/link'

const productSchema = z.object({
  name: z.string().min(3, 'Le nom doit contenir au moins 3 caractères').max(120),
  slug: z
    .string()
    .min(3, 'Le slug doit contenir au moins 3 caractères')
    .max(120)
    .regex(/^[a-z0-9-]+$/, 'Slug invalide (lettres minuscules, chiffres, tirets uniquement)'),
  categoryId: z.string().min(1, 'Veuillez sélectionner une catégorie'),
  description: z.string().min(20, 'La description doit contenir au moins 20 caractères'),
  shortDescription: z.string().max(300).optional(),
  supplierPrice: z.coerce.number().min(0.01, 'Le prix doit être supérieur à 0'),
  productionDays: z.coerce
    .number()
    .min(1, 'Minimum 1 jour')
    .max(90, 'Maximum 90 jours'),
  weight: z.coerce.number().min(0).optional(),
  length: z.coerce.number().min(0).optional(),
  width: z.coerce.number().min(0).optional(),
  height: z.coerce.number().min(0).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'DISABLED']),
})

type ProductForm = z.infer<typeof productSchema>

interface Category {
  id: string
  name: string
}

export default function NewProductPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [categories, setCategories] = useState<Category[]>([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)
  const [categoriesError, setCategoriesError] = useState<string | null>(null)

  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      status: 'DRAFT',
      productionDays: 5,
      slug: '',
    },
  })

  const [isFeatured, setIsFeatured] = useState(false)

  // Les catégories sont un endpoint authentifié : on les charge côté client.
  const fetchCategories = useCallback(async (signal?: AbortSignal) => {
    setCategoriesLoading(true)
    setCategoriesError(null)
    try {
      const response = await fetch('/api/categories?isActive=true', { signal })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Erreur lors du chargement des catégories')
      }
      const data = await response.json()
      setCategories(data.categories || [])
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setCategoriesError(
        err instanceof Error ? err.message : 'Erreur lors du chargement des catégories'
      )
    } finally {
      if (!signal?.aborted) setCategoriesLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchCategories(controller.signal)
    return () => controller.abort()
  }, [fetchCategories])

  // Génération automatique du slug depuis le nom.
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

  async function handleUpload(file: File) {
    setUploading(true)
    setUploadError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const response = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || "Erreur lors de l'envoi de l'image")
      }
      setImageUrls((prev) => (prev.length >= 8 ? prev : [...prev, data.url]))
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Erreur lors de l'envoi de l'image"
      )
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const onSubmit = async (data: ProductForm) => {
    setIsSubmitting(true)
    setError(null)
    try {
      // Le schéma serveur n'accepte que des dimensions strictement positives :
      // un champ laissé vide part à `undefined` plutôt qu'à 0.
      const positive = (value?: number) =>
        value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined

      const response = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          slug: data.slug,
          categoryId: data.categoryId,
          description: data.description,
          shortDescription: data.shortDescription || undefined,
          supplierPrice: data.supplierPrice,
          productionDays: data.productionDays,
          weight: positive(data.weight),
          length: positive(data.length),
          width: positive(data.width),
          height: positive(data.height),
          status: data.status,
          isFeatured,
          imageUrls,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.error || 'Erreur lors de la création du produit')
      }

      router.push('/dashboard/supplier/products')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création du produit')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* En-tête */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/supplier/products"
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          aria-label="Retour"
        >
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
        {/* Informations de base */}
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
                value={watch('categoryId') || ''}
                onValueChange={(value) => setValue('categoryId', value, { shouldValidate: true })}
                disabled={isSubmitting || categoriesLoading}
              >
                <SelectTrigger id="categoryId">
                  <SelectValue
                    placeholder={
                      categoriesLoading ? 'Chargement des catégories...' : 'Sélectionner une catégorie'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {categoriesError && (
                <p className="text-sm text-destructive">{categoriesError}</p>
              )}
              {errors.categoryId && (
                <p className="text-sm text-destructive">{errors.categoryId.message}</p>
              )}
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
                placeholder="Résumé pour les listes (max 300 caractères)"
                rows={3}
                maxLength={300}
                {...register('shortDescription')}
                error={errors.shortDescription?.message}
                disabled={isSubmitting}
              />
            </div>
          </CardContent>
        </Card>

        {/* Prix et fabrication */}
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
                  max="90"
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
                  onValueChange={(value) =>
                    setValue('status', value as 'DRAFT' | 'ACTIVE' | 'DISABLED', {
                      shouldValidate: true,
                    })
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">Brouillon</SelectItem>
                    <SelectItem value="ACTIVE">Actif</SelectItem>
                    <SelectItem value="DISABLED">Désactivé</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="isFeatured"
                checked={isFeatured}
                onCheckedChange={(checked) => setIsFeatured(checked === true)}
                disabled={isSubmitting}
              />
              <Label htmlFor="isFeatured" className="mb-0 font-normal">
                Mettre en avant dans le catalogue
              </Label>
            </div>
          </CardContent>
        </Card>

        {/* Images */}
        <Card>
          <CardHeader>
            <CardTitle>Images</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-500">
              JPEG, PNG, WebP ou GIF, 5 Mo maximum par fichier. La première image sert
              d&apos;illustration principale.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleUpload(file)
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || isSubmitting || imageUrls.length >= 8}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ImagePlus className="h-4 w-4 mr-2" />
              )}
              {uploading ? 'Envoi en cours...' : 'Ajouter une image'}
            </Button>

            {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}

            {imageUrls.length > 0 && (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {imageUrls.map((url, index) => (
                  <li key={url} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Aperçu ${index + 1}`}
                      className="h-24 w-full rounded-md border border-gray-200 object-cover"
                    />
                    {index === 0 && (
                      <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
                        Principale
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setImageUrls((prev) => prev.filter((u) => u !== url))}
                      className="absolute right-1 top-1 rounded bg-white/90 p-1 text-red-600 hover:bg-white"
                      aria-label="Retirer cette image"
                      disabled={isSubmitting}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Dimensions */}
        <Card>
          <CardHeader>
            <CardTitle>Dimensions et poids (pour l&apos;expédition)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-500">
              Ces informations sont utilisées pour calculer les frais d&apos;expédition
              AMEEX
            </p>
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
                  error={errors.weight?.message}
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
                  error={errors.length?.message}
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
                  error={errors.width?.message}
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
                  error={errors.height?.message}
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
          <Link href="/dashboard/supplier/products">
            <Button variant="outline" type="button">
              Annuler
            </Button>
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
