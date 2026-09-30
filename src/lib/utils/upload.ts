import path from 'path'
import fs from 'fs/promises'
import { randomUUID } from 'crypto'

const UPLOAD_DIR = process.env.UPLOAD_DIR || './public/uploads'
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '5242880', 10) // 5MB default
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
}

export function ensureUploadDir(): Promise<string> {
  return fs.mkdir(UPLOAD_DIR, { recursive: true }).then(() => UPLOAD_DIR)
}

export function validateFileSize(size: number): { isValid: boolean; error?: string } {
  if (size > MAX_FILE_SIZE) {
    return {
      isValid: false,
      error: `La taille du fichier dépasse la limite de ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} Mo`,
    }
  }
  return { isValid: true }
}

export function validateMimeType(mimeType: string): { isValid: boolean; error?: string } {
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return {
      isValid: false,
      error: `Type de fichier non supporté. Types acceptés : ${ALLOWED_MIME_TYPES.join(', ')}`,
    }
  }
  return { isValid: true }
}

export function generateFileName(originalName: string, mimeType: string): string {
  const extension = EXTENSION_BY_MIME[mimeType] || path.extname(originalName).toLowerCase()
  const nameWithoutExt = path.basename(originalName, path.extname(originalName))
  const sanitizedName = nameWithoutExt
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()

  const safeName = sanitizedName.slice(0, 50) || 'image'
  return `${safeName}-${randomUUID().slice(0, 8)}${extension}`
}

export interface SaveFileResult {
  success: boolean
  filename?: string
  filepath?: string
  url?: string
  error?: string
}

export async function saveFile(
  file: File
): Promise<SaveFileResult> {
  try {
    const sizeCheck = validateFileSize(file.size)
    if (!sizeCheck.isValid) return { success: false, error: sizeCheck.error }

    const mimeCheck = validateMimeType(file.type)
    if (!mimeCheck.isValid) return { success: false, error: mimeCheck.error }

    const buffer = Buffer.from(await file.arrayBuffer())
    await ensureUploadDir()

    const filename = generateFileName(file.name || 'image', file.type)
    const filepath = path.join(UPLOAD_DIR, filename)

    await fs.writeFile(filepath, new Uint8Array(buffer))

    return {
      success: true,
      filename,
      filepath,
      url: `/uploads/${filename}`,
    }
  } catch (error) {
    console.error('File save error:', error)
    return { success: false, error: "Échec de l'enregistrement du fichier" }
  }
}

export async function deleteFile(filename: string): Promise<{ success: boolean; error?: string }> {
  try {
    const filepath = getFilePath(filename)
    if (!filepath) {
      return { success: false, error: 'Nom de fichier invalide' }
    }
    await fs.unlink(filepath)
    return { success: true }
  } catch (error) {
    console.error('File deletion error:', error)
    return { success: false, error: 'Échec de la suppression du fichier' }
  }
}

export function getFileUrl(filename: string): string {
  if (!filename) return ''
  return `/uploads/${filename}`
}

/**
 * Resolves a stored filename to an absolute path, refusing anything that
 * tries to escape the upload directory (path traversal).
 */
export function getFilePath(filename: string): string | null {
  if (!filename) return null

  const base = path.resolve(UPLOAD_DIR)
  const target = path.resolve(base, filename)

  if (target !== base && !target.startsWith(base + path.sep)) {
    return null
  }

  return target
}
