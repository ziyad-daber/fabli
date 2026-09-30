import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth/edge'
import { NextResponse } from 'next/server'

const { auth } = NextAuth(authConfig)

const publicRoutes = ['/auth/login', '/auth/register', '/auth/forgot-password', '/auth/reset-password']
const apiAuthPrefix = '/api/auth'

export default auth((req) => {
  const { nextUrl } = req
  const isLoggedIn = !!req.auth
  const isApiAuthRoute = nextUrl.pathname.startsWith(apiAuthPrefix)
  const isPublicRoute = publicRoutes.includes(nextUrl.pathname)
  const isRoot = nextUrl.pathname === '/'

  if (isApiAuthRoute) {
    return NextResponse.next()
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
      return NextResponse.redirect(new URL(destination || '/dashboard/reseller', nextUrl))
    }
    return NextResponse.redirect(new URL('/auth/login', nextUrl))
  }

  if (!isLoggedIn && !isPublicRoute) {
    const callbackUrl = nextUrl.pathname + nextUrl.search
    return NextResponse.redirect(new URL(`/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}`, nextUrl))
  }

  // Role-based route protection
  if (isLoggedIn && req.auth) {
    const role = req.auth.user.role
    
    // Admin routes
    if (nextUrl.pathname.startsWith('/dashboard/admin') && role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/dashboard/reseller', nextUrl))
    }
    
    // Supplier routes
    if (nextUrl.pathname.startsWith('/dashboard/supplier') && role !== 'SUPPLIER' && role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/dashboard/reseller', nextUrl))
    }
    
    // Reseller routes
    if (nextUrl.pathname.startsWith('/dashboard/reseller') && role !== 'RESELLER' && role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/dashboard/supplier', nextUrl))
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|uploads|.*\\.png$).*)'],
}