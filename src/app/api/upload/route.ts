export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth/config'
import { NextResponse } from 'next/server'
import { saveFile } from '@/lib/utils/upload'

const MAX_UPLOAD_BYTES = parseInt(process.env.MAX_FILE_SIZE || '5242880', 10)

// POST /api/upload - Upload a single product image (admin or supplier)
export async function POST(request: Request) {
  try {
    const session = await auth()

    if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPPLIER')) {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 403 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'Aucun fichier reçu' },
        { status: 400 }
      )
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `La taille du fichier dépasse la limite de ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} Mo` },
        { status: 413 }
      )
    }

    const result = await saveFile(file)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json(
      {
        success: true,
        url: result.url,
        filename: result.filename,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[Upload POST] Error:', error)
    return NextResponse.json(
      { error: "Erreur lors de l'upload" },
      { status: 500 }
    )
  }
}
