'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ArrowLeft, Save, ImagePlus, X, Loader2, AlertTriangle } from 'lucide-react'
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

interface ProductDetail {
  id: string
  name: string
  slug: string
  description: string
  shortDescription: string | null
  categoryId: string
  supplierPrice: string | number
  productionDays: number
  weight: string | number | null
  length: string | number | null
  width: string | number | null
  height: string | number | null
  status: 'DRAFT' | 'ACTIVE' | 'DISABLED'
  isFeatured: boolean
  images: { id: string; url: string; isPrimary: boolean; sortOrder: number }[]
}

const STATUS_LABELS: Record<ProductDetail['status'], string> = {
  DRAFT: 'Brouillon',
  ACTIVE: 'Actif',
  DISABLED: 'Désactivé',
}

export default function EditProductPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const productId = params?.id

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [categories, setCategories] = useState<Category[]>([])
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [isFeatured, setIsFeatured] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const {
    register,
    handleSubmit,
    watch,
    reset,
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

  const fetchProduct = useCallback(
    async (signal?: AbortSignal) => {
      if (!productId) return
      setLoading(true)
      setLoadError(null)
      try {
        const response = await fetch(`/api/products/${productId}`, { signal })
        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new Error(data.error || 'Erreur lors du chargement du produit')
        }
        const product: ProductDetail = await response.json()

        reset({
          name: product.name,
          slug: product.slug,
          categoryId: product.categoryId,
          description: product.description,
          shortDescription: product.shortDescription ?? '',
          supplierPrice: Number(product.supplierPrice),
          productionDays: product.productionDays,
          weight: product.weight !== null ? Number(product.weight) : undefined,
          length: product.length !== null ? Number(product.length) : undefined,
          width: product.width !== null ? Number(product.width) : undefined,
          height: product.height !== null ? Number(product.height) : undefined,
          status: product.status,
        })
        setIsFeatured(product.isFeatured)
        setImageUrls((product.images ?? []).map((image) => image.url))
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setLoadError(err instanceof Error ? err.message : 'Une erreur est survenue')
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    },
    [productId, reset]
  )

  const fetchCategories = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/categories?isActive=true', { signal })
      if (!response.ok) return
      const data = await response.json()
      setCategories(data.categories || [])
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchProduct(controller.signal)
    fetchCategories(controller.signal)
    return () => controller.abort()
  }, [fetchProduct, fetchCategories])

  // Le slug suit le nom tant que l'utilisateur ne l'a pas saisi lui-même.
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
    if (!productId) return
    setIsSubmitting(true)
    setError(null)
    try {
      const positive = (value?: number) =>
        value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined

      const response = await fetch(`/api/products/${productId}`, {
        method: 'PATCH',
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
        throw new Error(payload.error || 'Erreur lors de la mise à jour du produit')
      }

      router.push('/dashboard/supplier/products')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la mise à jour du produit')
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-sm">{loadError}</span>
        </div>
        <Link href="/dashboard/supplier/products">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour à mes produits
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/supplier/products"
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          aria-label="Retour"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Modifier le produit</h1>
          <p className="text-gray-500">{watch('name') || 'Produit'}</p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
                  {...register('name', { onChange: handleNameChange })}
                  error={errors.name?.message}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Slug (URL) *</Label>
                <Input
                  id="slug"
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
                disabled={isSubmitting}
              >
                <SelectTrigger id="categoryId">
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
              {errors.categoryId && (
                <p className="text-sm text-destructive">{errors.categoryId.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description complète *</Label>
              <Textarea
                id="description"
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
                rows={3}
                maxLength={300}
                {...register('shortDescription')}
                error={errors.shortDescription?.message}
                disabled={isSubmitting}
              />
            </div>
          </CardContent>
        </Card>

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
                    setValue('status', value as ProductForm['status'], { shouldValidate: true })
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_LABELS) as ProductForm['status'][]).map((status) => (
                      <SelectItem key={status} value={status}>
                        {STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
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

        <Card>
          <CardHeader>
            <CardTitle>Images</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-500">
              La liste envoyée remplace intégralement les images actuelles du produit.
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

        <Card>
          <CardHeader>
            <CardTitle>Dimensions et poids (pour l&apos;expédition)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="weight">Poids (kg)</Label>
                <Input
                  id="weight"
                  type="number"
                  step="0.001"
                  min="0"
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
                  {...register('height')}
                  error={errors.height?.message}
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
          <Link href="/dashboard/supplier/products">
            <Button variant="outline" type="button">
              Annuler
            </Button>
          </Link>
          <Button type="submit" loading={isSubmitting}>
            <Save className="h-4 w-4 mr-2" />
            Enregistrer les modifications
          </Button>
        </div>
      </form>
    </div>
  )
}
