import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/db/prisma'
import { verifyPassword } from '@/lib/auth/password'
import { authConfig } from '@/lib/auth/edge'
import { UserStatus } from '@prisma/client'

/** Verrouillage temporaire après une série d'échecs (§9). */
const MAX_FAILED_LOGINS = 5
const LOCK_DURATION_MS = 15 * 60 * 1000

/**
 * Instance NextAuth complète pour le runtime Node.js. Étend la configuration
 * Edge-safe (`src/lib/auth/edge.ts`) avec le fournisseur « credentials », seul
 * composant qui a besoin de Prisma et bcrypt — et qui ne doit jamais être
 * tiré dans le middleware Edge.
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

        const email = String(credentials.email).toLowerCase()
        const user = await prisma.user.findUnique({
          where: { email },
          include: {
            supplierProfile: true,
            resellerProfile: true,
          },
        })

        if (!user) {
          // Message volontairement générique : ne pas révéler quelles
          // adresses sont enregistrées.
          throw new Error('Email ou mot de passe incorrect')
        }

        if (user.lockedUntil && user.lockedUntil > new Date()) {
          const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000)
          throw new Error(
            `Compte temporairement verrouillé après plusieurs tentatives échouées. Réessayez dans ${minutes} minute(s).`
          )
        }

        if (user.status !== UserStatus.ACTIVE) {
          throw new Error(
            user.status === UserStatus.PENDING_VERIFICATION
              ? "Votre compte est en attente de validation par un administrateur"
              : 'Compte désactivé ou suspendu'
          )
        }

        const isValid = await verifyPassword(String(credentials.password), user.passwordHash)
        if (!isValid) {
          const failed = user.failedLogins + 1
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLogins: failed,
              lockedUntil:
                failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_DURATION_MS) : null,
            },
          })
          throw new Error('Email ou mot de passe incorrect')
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
        })

        return {
          id: user.id,
          email: user.email,
          role: user.role,
          supplierProfile: user.supplierProfile
            ? { id: user.supplierProfile.id, isVerified: user.supplierProfile.isVerified }
            : null,
          resellerProfile: user.resellerProfile
            ? { id: user.resellerProfile.id, isVerified: user.resellerProfile.isVerified }
            : null,
        }
      },
    }),
  ],
})