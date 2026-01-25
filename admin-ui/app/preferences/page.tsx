'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getPreferences, rollbackPreference, ApiError } from '@/lib/api'
import type { PreferenceReadModel } from '@/lib/types'
import { ErrorAlert } from '@/components/ErrorAlert'
import { useMutation } from '@/hooks/useMutation'
import { usePermissions } from '@/hooks/usePermissions'
import { RefreshCw, RotateCcw, Loader2 } from 'lucide-react'

const agents = ['all', 'CoachAgent', 'PlannerAgent', 'LoggerAgent']

export default function PreferencesPage() {
  const [preferences, setPreferences] = useState<PreferenceReadModel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiError | Error | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<string>('all')
  const [rollbackDialog, setRollbackDialog] = useState<{
    open: boolean
    preference: PreferenceReadModel | null
  }>({ open: false, preference: null })

  // V14: Role-based permissions
  const { canRollback, role } = usePermissions()

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = selectedAgent !== 'all' ? { agent: selectedAgent } : {}
      const response = await getPreferences(params)
      setPreferences(response.data ?? [])
    } catch (err) {
      setError(err instanceof ApiError ? err : err instanceof Error ? err : new Error('Failed to load preferences'))
    } finally {
      setLoading(false)
    }
  }, [selectedAgent])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // V14: Mutation with double-submit prevention
  const rollbackMutation = useMutation(
    async (preference: PreferenceReadModel) => {
      return rollbackPreference(
        preference.agentType,
        preference.preferenceKey,
        'Manual rollback from admin UI'
      )
    },
    {
      onSuccess: (result) => {
        if (result.success) {
          fetchData()
        } else {
          setError(new Error(result.errors.join(', ')))
        }
      },
      onError: (err) => {
        setError(err instanceof ApiError ? err : new Error(err.message))
      },
      onSettled: () => {
        setRollbackDialog({ open: false, preference: null })
      },
    }
  )

  const handleRollback = () => {
    if (!rollbackDialog.preference) return
    rollbackMutation.mutate(rollbackDialog.preference)
  }

  const getRiskBadgeVariant = (risk: string) => {
    switch (risk) {
      case 'low':
        return 'success'
      case 'medium':
        return 'warning'
      case 'high':
        return 'destructive'
      default:
        return 'outline'
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Preferences</h1>
          <p className="text-muted-foreground mt-2">
            View and manage agent preferences
          </p>
          {/* V14: Show user role for awareness */}
          {role && (
            <p className="text-sm text-muted-foreground mt-1">
              Logged in as: <Badge variant="outline">{role}</Badge>
              {!canRollback && (
                <span className="ml-2 text-yellow-600">(Rollback not permitted)</span>
              )}
            </p>
          )}
        </div>
        <Button variant="outline" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Agent Preferences</CardTitle>
              <CardDescription>
                Current preference values for each agent
              </CardDescription>
            </div>
            <Select value={selectedAgent} onValueChange={setSelectedAgent}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by agent" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((agent) => (
                  <SelectItem key={agent} value={agent}>
                    {agent === 'all' ? 'All Agents' : agent}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {/* V14: ErrorAlert with correlationId */}
          <ErrorAlert error={error} onDismiss={() => setError(null)} />

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Preference</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Default</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Adaptive</TableHead>
                <TableHead>Last Changed</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading preferences...
                    </div>
                  </TableCell>
                </TableRow>
              ) : preferences.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    No preferences found
                  </TableCell>
                </TableRow>
              ) : (
                preferences.map((pref) => (
                  <TableRow key={`${pref.agentType}-${pref.preferenceKey}`}>
                    <TableCell className="font-medium">{pref.agentType}</TableCell>
                    <TableCell>{pref.preferenceKey}</TableCell>
                    <TableCell>
                      <code className="bg-muted px-2 py-1 rounded text-sm">
                        {String(pref.currentValue)}
                      </code>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {String(pref.defaultValue)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getRiskBadgeVariant(pref.riskLevel)}>
                        {pref.riskLevel}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {pref.adaptive ? (
                        <Badge variant="secondary">Yes</Badge>
                      ) : (
                        <span className="text-muted-foreground">No</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {pref.lastChangedAt
                        ? new Date(pref.lastChangedAt).toLocaleString()
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {/* V14: Role-based UI gating - only show rollback if user canRollback */}
                      {pref.rollbackAvailable && canRollback && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setRollbackDialog({ open: true, preference: pref })
                          }
                        >
                          <RotateCcw className="h-4 w-4 mr-1" />
                          Rollback
                        </Button>
                      )}
                      {/* V14: Show status for non-admin users */}
                      {pref.rollbackAvailable && !canRollback && (
                        <span className="text-xs text-muted-foreground">Admin only</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={rollbackDialog.open}
        onOpenChange={(open) => {
          // V14: Prevent closing while mutation is in progress
          if (!open && rollbackMutation.isLoading) return
          setRollbackDialog({ open, preference: open ? rollbackDialog.preference : null })
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Rollback</DialogTitle>
            <DialogDescription>
              Are you sure you want to rollback this preference to its previous value?
            </DialogDescription>
          </DialogHeader>
          {rollbackDialog.preference && (
            <div className="py-4">
              <dl className="space-y-2">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Agent:</dt>
                  <dd className="font-medium">{rollbackDialog.preference.agentType}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Preference:</dt>
                  <dd className="font-medium">{rollbackDialog.preference.preferenceKey}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Current Value:</dt>
                  <dd>
                    <code className="bg-muted px-2 py-1 rounded">
                      {String(rollbackDialog.preference.currentValue)}
                    </code>
                  </dd>
                </div>
              </dl>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRollbackDialog({ open: false, preference: null })}
              disabled={rollbackMutation.isLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRollback}
              disabled={rollbackMutation.isLoading}
            >
              {/* V14: Double-submit prevention - show loading state */}
              {rollbackMutation.isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {rollbackMutation.isLoading ? 'Rolling back...' : 'Rollback'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
