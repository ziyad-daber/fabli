import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/db/prisma'
import { verifyPassword } from '@/lib/auth/password'
import { authConfig } from '@/lib/auth/edge'
import { UserStatus } from '@prisma/client'

/**
 * Full auth instance for the Node.js runtime. Extends the Edge-safe config in
 * `src/lib/auth/edge.ts` with the credentials provider, which requires Prisma
 * and bcrypt and therefore must never be pulled into the Edge middleware.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: async (credentials) => {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email et mot de passe requis')
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          include: {
            supplierProfile: true,
            resellerProfile: true,
          },
        })

        if (!user) {
          throw new Error('Utilisateur non trouvé')
        }

        if (user.status !== UserStatus.ACTIVE) {
          throw new Error('Compte non activé ou suspendu')
        }

        const isValid = await verifyPassword(credentials.password as string, user.passwordHash)
        if (!isValid) {
          throw new Error('Mot de passe incorrect')
        }

        return {
          id: user.id,
          email: user.email,
          role: user.role,
          supplierProfile: user.supplierProfile ? { id: user.supplierProfile.id, isVerified: user.supplierProfile.isVerified } : null,
          resellerProfile: user.resellerProfile ? { id: user.resellerProfile.id, isVerified: user.resellerProfile.isVerified } : null,
        }
      },
    }),
  ],
})
