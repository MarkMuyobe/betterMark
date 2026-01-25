'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AdminShell } from '@/components/AdminShell'
import { useAuth } from '@/lib/auth'
import { Badge } from '@/components/ui/badge'
import { Settings, Lightbulb, Scale, ClipboardList } from 'lucide-react'
import Link from 'next/link'

const dashboardCards = [
  {
    title: 'Preferences',
    description: 'View and manage agent preferences',
    href: '/preferences',
    icon: Settings,
    color: 'text-blue-500',
  },
  {
    title: 'Suggestions',
    description: 'Review and approve preference suggestions',
    href: '/suggestions',
    icon: Lightbulb,
    color: 'text-yellow-500',
  },
  {
    title: 'Arbitrations',
    description: 'Monitor arbitration decisions and escalations',
    href: '/arbitrations',
    icon: Scale,
    color: 'text-purple-500',
  },
  {
    title: 'Audit Trail',
    description: 'Review system activity and changes',
    href: '/audit',
    icon: ClipboardList,
    color: 'text-green-500',
  },
]

export default function Home() {
  const { user, canApprove, canRollback } = useAuth();

  return (
    <AdminShell>
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Monitor and control the BetterMark agent system
          </p>
        </div>
        {user && (
          <div className="text-right">
            <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
              {user.role}
            </Badge>
            <p className="text-xs text-muted-foreground mt-1">
              {canRollback() ? 'Full access' : canApprove() ? 'Can approve/reject' : 'Read-only'}
            </p>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {dashboardCards.map((card) => (
          <Link key={card.href} href={card.href}>
            <Card className="hover:border-primary/50 transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {card.title}
                </CardTitle>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </CardHeader>
              <CardContent>
                <CardDescription>{card.description}</CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>System Status</CardTitle>
          <CardDescription>
            Overview of the agent governance system
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">API Status</span>
              <span className="text-sm text-green-500">Connected</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Registered Agents</span>
              <span className="text-sm text-muted-foreground">CoachAgent, PlannerAgent, LoggerAgent</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
    </AdminShell>
  )
}
