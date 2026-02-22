'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, Wallet, Receipt, Settings, LogOut, PiggyBank, History } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import { getTranslation } from '@/lib/translations'
import type { Language } from '@/lib/translations'

const navItems = [
  { href: '/dashboard', labelKey: 'dashboard' as const, icon: LayoutDashboard },
  { href: '/accounts', labelKey: 'accounts' as const, icon: Wallet },
  { href: '/transactions', labelKey: 'transactions' as const, icon: Receipt },
  { href: '/history', labelKey: 'history' as const, icon: History },
  { href: '/settings', labelKey: 'settings' as const, icon: Settings },
]

export function Sidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { language, setLanguage } = useLanguage()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang)
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 min-h-screen bg-card border-r border-border p-4">
        <div className="flex items-center gap-2 mb-8">
          <PiggyBank className="h-6 w-6 text-emerald-500" />
          <span className="font-bold text-lg">Celengan</span>
        </div>

        <nav className="flex-1 space-y-1">
          {navItems.map(({ href, labelKey, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                pathname === href
                  ? 'bg-emerald-500/10 text-emerald-400 font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {getTranslation(language, labelKey)}
            </Link>
          ))}
        </nav>

        <div className="border-t border-border pt-4 space-y-2">
          {/* Language Switcher */}
          <div className="flex gap-1 px-3 py-2">
            <button
              onClick={() => handleLanguageChange('id')}
              className={cn(
                'flex-1 px-2 py-1 text-xs rounded transition-colors',
                language === 'id'
                  ? 'bg-emerald-500/20 text-emerald-400 font-medium'
                  : 'bg-accent text-muted-foreground hover:text-foreground'
              )}
            >
              ID
            </button>
            <button
              onClick={() => handleLanguageChange('en')}
              className={cn(
                'flex-1 px-2 py-1 text-xs rounded transition-colors',
                language === 'en'
                  ? 'bg-emerald-500/20 text-emerald-400 font-medium'
                  : 'bg-accent text-muted-foreground hover:text-foreground'
              )}
            >
              EN
            </button>
          </div>

          <p className="text-xs text-muted-foreground truncate px-3">{userEmail}</p>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground w-full transition-colors"
          >
            <LogOut className="h-4 w-4" />
            {getTranslation(language, 'signOut')}
          </button>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border flex justify-around p-2 z-50">
        {navItems.map(({ href, labelKey, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex flex-col items-center gap-1 px-3 py-1 rounded-md text-xs transition-colors',
              pathname === href ? 'text-emerald-400' : 'text-muted-foreground'
            )}
          >
            <Icon className="h-5 w-5" />
            {getTranslation(language, labelKey)}
          </Link>
        ))}
      </nav>
    </>
  )
}
