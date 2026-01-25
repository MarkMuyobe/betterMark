'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Settings,
  Lightbulb,
  Scale,
  ClipboardList,
  Home,
  Menu,
  LogOut,
  ArrowRightLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { useAuth } from '@/lib/auth'

const navigation = [
  { name: 'Dashboard', href: '/', icon: Home },
  { name: 'Preferences', href: '/preferences', icon: Settings },
  { name: 'Suggestions', href: '/suggestions', icon: Lightbulb },
  { name: 'Arbitrations', href: '/arbitrations', icon: Scale },
  { name: 'Audit Trail', href: '/audit', icon: ClipboardList },
]

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar toggle */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 flex items-center gap-x-6 bg-background px-4 py-4 shadow-sm sm:px-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          <Menu className="h-6 w-6" />
        </Button>
        <div className="flex-1 text-sm font-semibold leading-6">
          BetterMark Admin
        </div>
      </div>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 w-72 bg-background">
            <Sidebar pathname={pathname} onNavigate={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
        <Sidebar pathname={pathname} />
      </div>

      {/* Main content */}
      <main className="py-10 lg:pl-72">
        <div className="px-4 sm:px-6 lg:px-8 mt-14 lg:mt-0">
          {children}
        </div>
      </main>
    </div>
  )
}

function Sidebar({
  pathname,
  onNavigate,
}: {
  pathname: string
  onNavigate?: () => void
}) {
  const { logout, user } = useAuth()

  const handleLogout = async () => {
    await logout()
    onNavigate?.()
  }

  return (
    <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r bg-background px-6 pb-4">
      <div className="flex h-16 shrink-0 items-center">
        <span className="text-xl font-bold">BetterMark Admin</span>
      </div>
      <nav className="flex flex-1 flex-col">
        <ul role="list" className="flex flex-1 flex-col gap-y-7">
          <li>
            <ul role="list" className="-mx-2 space-y-1">
              {navigation.map((item) => (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      pathname === item.href
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                      'group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold'
                    )}
                  >
                    <item.icon
                      className={cn(
                        pathname === item.href
                          ? 'text-foreground'
                          : 'text-muted-foreground group-hover:text-foreground',
                        'h-6 w-6 shrink-0'
                      )}
                      aria-hidden="true"
                    />
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </li>
          <li className="mt-auto space-y-3">
            {user && (
              <div className="text-xs text-muted-foreground">
                Logged in as {user.role}
              </div>
            )}
            <Link href="/dashboard">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
              >
                <ArrowRightLeft className="h-4 w-4 mr-2" />
                Switch to Product UI
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="w-full justify-start text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
            <div className="text-xs text-muted-foreground">
              V13 Admin Control Plane
            </div>
          </li>
        </ul>
      </nav>
    </div>
  )
}
