import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth/edge'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createSupabaseClient } from '@/lib/supabase/middleware'

const { auth } = NextAuth(authConfig)

const publicRoutes = ['/auth/login', '/auth/register', '/auth/forgot-password', '/auth/reset-password']
const apiAuthPrefix = '/api/auth'

const supabaseConfigured = () =>
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

export default auth(async (req) => {
  const { nextUrl } = req
  const isLoggedIn = !!req.auth
  const isApiAuthRoute = nextUrl.pathname.startsWith(apiAuthPrefix)
  const isPublicRoute = publicRoutes.includes(nextUrl.pathname)
  const isRoot = nextUrl.pathname === '/'

  // Refresh the Supabase session cookie before the routing rules, so rotated
  // tokens reach the response on every path including the redirects below.
  // Skipped when Supabase is not configured: this app authenticates with
  // NextAuth, so Supabase session support is opt-in.
  let supabaseResponse: NextResponse | null = null
  if (supabaseConfigured()) {
    try {
      const { supabase, supabaseResponse: refreshed } = createSupabaseClient(
        req as unknown as NextRequest
      )
      // getClaims() validates the token and triggers the cookie refresh.
      await supabase.auth.getClaims()
      supabaseResponse = refreshed
    } catch {
      // A Supabase outage must not take the whole app offline; the session is
      // simply not refreshed on this request.
    }
  }

  /** Copies refreshed Supabase cookies onto the response we are about to send. */
  const withSupabase = (response: NextResponse): NextResponse => {
    if (!supabaseResponse) return response
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie.name, cookie.value)
    })
    return response
  }

  if (isApiAuthRoute) {
    return withSupabase(NextResponse.next())
  }

  if (isRoot) {
    if (isLoggedIn) {
      const role = req.auth?.user.role
      const redirectMap: Record<string, string> = {
        ADMIN: '/dashboard/admin',
        SUPPLIER: '/dashboard/supplier',
        RESELLER: '/dashboard/reseller',
      }
      const destination = role ? redirectMap[role] : undefined
      return withSupabase(
        NextResponse.redirect(new URL(destination || '/dashboard/reseller', nextUrl))
      )
    }
    return withSupabase(NextResponse.redirect(new URL('/auth/login', nextUrl)))
  }

  if (!isLoggedIn && !isPublicRoute) {
    const callbackUrl = nextUrl.pathname + nextUrl.search
    return withSupabase(
      NextResponse.redirect(
        new URL(`/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}`, nextUrl)
      )
    )
  }

  // Role-based route protection
  if (isLoggedIn && req.auth) {
    const role = req.auth.user.role

    // Admin routes
    if (nextUrl.pathname.startsWith('/dashboard/admin') && role !== 'ADMIN') {
      return withSupabase(NextResponse.redirect(new URL('/dashboard/reseller', nextUrl)))
    }

    // Supplier routes
    if (
      nextUrl.pathname.startsWith('/dashboard/supplier') &&
      role !== 'SUPPLIER' &&
      role !== 'ADMIN'
    ) {
      return withSupabase(NextResponse.redirect(new URL('/dashboard/reseller', nextUrl)))
    }

    // Reseller routes
    if (
      nextUrl.pathname.startsWith('/dashboard/reseller') &&
      role !== 'RESELLER' &&
      role !== 'ADMIN'
    ) {
      return withSupabase(NextResponse.redirect(new URL('/dashboard/supplier', nextUrl)))
    }
  }

  return withSupabase(NextResponse.next())
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|uploads|.*\\.png$).*)'],
}