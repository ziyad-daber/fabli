export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth/config'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const body = await request.json()
    const { apiKey, accountId, baseUrl } = body

    if (!apiKey || !accountId) {
      return NextResponse.json(
        { error: 'API Key et Account ID sont requis' },
        { status: 400 }
      )
    }

    const endpoint = baseUrl
      ? `${baseUrl}/customer/Delivery/Parcels/Info`
      : 'https://api.ameex.app/customer/Delivery/Parcels/Info'

    const query = new URLSearchParams({
      ParcelCode: 'TEST_CODE',
    })

    const url = `${endpoint}?${query}`

    let success = false
    let statusCode: number | null = null
    let responseBody: unknown = null

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'C-Api-Id': apiKey,
          'C-Api-Key': accountId,
        },
        next: { revalidate: 0 },
      })

      statusCode = res.status
      responseBody = await res.text()

      if (res.status === 200 || res.status === 400) {
        success = true
      }
    } catch (error: unknown) {
      console.error('[AMEEX Test] Connection error:', error)
      return NextResponse.json({
        success: false,
        error: 'Impossible de se connecter à AMEEX. Vérifiez l\'URL de base.',
        statusCode,
        responseBody,
      })
    }

    return NextResponse.json({
      success,
      message: success
        ? 'Connexion réussie avec l\'API AMEEX'
        : `Erreur HTTP ${statusCode}: ${responseBody}`,
      statusCode,
      responseBody,
    })
  } catch (error) {
    console.error('[AMEEX Test] Error:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
