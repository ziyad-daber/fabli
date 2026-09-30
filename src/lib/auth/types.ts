import { DefaultSession } from 'next-auth'
import { DefaultJWT } from 'next-auth/jwt'
import { UserRole } from '@prisma/client'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: UserRole
      supplierProfile: { id: string; isVerified: boolean } | null
      resellerProfile: { id: string; isVerified: boolean } | null
    } & DefaultSession['user']
  }

  interface User {
    role: UserRole
    supplierProfile: { id: string; isVerified: boolean } | null
    resellerProfile: { id: string; isVerified: boolean } | null
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string
    role: UserRole
    supplierProfile: { id: string; isVerified: boolean } | null
    resellerProfile: { id: string; isVerified: boolean } | null
  }
}