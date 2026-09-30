import type { NextAuthConfig } from 'next-auth'
import type { UserRole } from '@prisma/client'

/**
 * Edge-safe auth configuration.
 *
 * This module must stay free of Node-only dependencies (bcryptjs, Prisma) so it
 * can be imported from `src/middleware.ts`, which runs on the Edge runtime.
 * The credentials provider that needs Prisma and bcrypt lives in
 * `src/lib/auth/config.ts`, which is only used in the Node.js runtime.
 */
export const authConfig = {
  pages: {
    signIn: '/auth/login',
    error: '/auth/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.id = user.id as string
        token.role = user.role
        token.supplierProfile = user.supplierProfile
        token.resellerProfile = user.resellerProfile
      }
      return token
    },
    session: async ({ session, token }) => {
      if (token) {
        session.user.id = token.id as string
        session.user.role = token.role as UserRole
        session.user.supplierProfile = token.supplierProfile as { id: string; isVerified: boolean } | null
        session.user.resellerProfile = token.resellerProfile as { id: string; isVerified: boolean } | null
      }
      return session
    },
  },
  providers: [],
} satisfies NextAuthConfig
