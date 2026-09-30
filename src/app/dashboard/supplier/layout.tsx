'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { cn } from '@/lib/utils/helpers'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Truck,
  Settings,
  LogOut,
  Menu,
  X,
  User,
  CreditCard,
  FileText,
} from 'lucide-react'

const navigation = [
  { name: 'Tableau de bord', href: '/dashboard/supplier', icon: LayoutDashboard },
  { name: 'Mes produits', href: '/dashboard/supplier/products', icon: Package },
  { name: 'Commandes', href: '/dashboard/supplier/orders', icon: ShoppingBag },
  { name: 'Expéditions', href: '/dashboard/supplier/shipments', icon: Truck },
  { name: 'Commissions & Règlements', href: '/dashboard/supplier/settlements', icon: CreditCard },
  { name: 'Profil', href: '/dashboard/supplier/profile', icon: User },
  { name: 'Paramètres', href: '/dashboard/supplier/settings', icon: Settings },
]

export default function SupplierLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleSignOut = () => {
    signOut({ callbackUrl: '/auth/login' })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out lg:translate-x-0',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        aria-label="Navigation principale"
      >
        <div className="flex h-16 items-center justify-between px-6 border-b border-gray-200">
          <Link href="/dashboard/supplier" className="text-xl font-bold text-primary">
            Fabli Fournisseur
          </Link>
          <button
            className="lg:hidden p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Fermer le menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto" role="navigation">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                {item.name}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground">
              {session?.user?.email?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {session?.user?.email}
              </p>
              <p className="text-xs text-gray-500 capitalize">{session?.user?.role?.toLowerCase()}</p>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full mt-3 justify-start gap-2"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
            Déconnexion
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-gray-200">
          <div className="flex h-full items-center justify-between px-4 sm:px-6">
            <button
              className="lg:hidden p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Ouvrir le menu"
              aria-expanded={mobileMenuOpen}
            >
              <Menu className="h-6 w-6" />
            </button>

            <div className="flex-1 lg:flex-none">
              <h1 className="text-lg font-semibold text-gray-900">
                {navigation.find((item) => pathname === item.href || pathname.startsWith(item.href + '/'))?.name || 'Tableau de bord'}
              </h1>
            </div>

            <div className="flex items-center gap-4">
              <span className="hidden sm:block text-sm text-gray-500">
                {session?.user?.email}
              </span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 sm:p-6 lg:p-8" role="main">
          {children}
        </main>
      </div>
    </div>
  )
}