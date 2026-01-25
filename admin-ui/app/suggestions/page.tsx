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
import { getSuggestions, approveSuggestion, rejectSuggestion, ApiError } from '@/lib/api'
import type { SuggestionReadModel, SuggestionStatus } from '@/lib/types'
import { ErrorAlert } from '@/components/ErrorAlert'
import { useMutation } from '@/hooks/useMutation'
import { usePermissions } from '@/hooks/usePermissions'
import { RefreshCw, Check, X, Loader2 } from 'lucide-react'

const statuses: (SuggestionStatus | 'all')[] = ['all', 'pending', 'approved', 'rejected', 'auto_applied']
const agents = ['all', 'CoachAgent', 'PlannerAgent', 'LoggerAgent']

export default function SuggestionsPage() {
  const [suggestions, setSuggestions] = useState<SuggestionReadModel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiError | Error | null>(null)
  const [selectedStatus, setSelectedStatus] = useState<string>('pending')
  const [selectedAgent, setSelectedAgent] = useState<string>('all')
  const [actionDialog, setActionDialog] = useState<{
    open: boolean
    action: 'approve' | 'reject' | null
    suggestion: SuggestionReadModel | null
  }>({ open: false, action: null, suggestion: null })
  const [rejectReason, setRejectReason] = useState('')

  // V14: Role-based permissions
  const { canApprove, role } = usePermissions()

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string> = {}
      if (selectedStatus !== 'all') params.status = selectedStatus
      if (selectedAgent !== 'all') params.agent = selectedAgent
      const response = await getSuggestions(params)
      setSuggestions(response.data ?? [])
    } catch (err) {
      setError(err instanceof ApiError ? err : err instanceof Error ? err : new Error('Failed to load suggestions'))
    } finally {
      setLoading(false)
    }
  }, [selectedStatus, selectedAgent])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // V14: Mutations with double-submit prevention
  const approveMutation = useMutation(
    async (suggestion: SuggestionReadModel) => {
      return approveSuggestion(suggestion.agentType, suggestion.suggestionId)
    },
    {
      onSuccess: (result) => {
        if (result.success) {
          fetchData()
        } else {
          setError(new Error(result.error || 'Approval failed'))
        }
      },
      onError: (err) => {
        setError(err instanceof ApiError ? err : new Error(err.message))
      },
      onSettled: () => {
        setActionDialog({ open: false, action: null, suggestion: null })
      },
    }
  )

  const rejectMutation = useMutation(
    async ({ suggestion, reason }: { suggestion: SuggestionReadModel; reason: string }) => {
      return rejectSuggestion(suggestion.agentType, suggestion.suggestionId, reason)
    },
    {
      onSuccess: (result) => {
        if (result.success) {
          fetchData()
          setRejectReason('')
        } else {
          setError(new Error(result.error || 'Rejection failed'))
        }
      },
      onError: (err) => {
        setError(err instanceof ApiError ? err : new Error(err.message))
      },
      onSettled: () => {
        setActionDialog({ open: false, action: null, suggestion: null })
      },
    }
  )

  const handleApprove = () => {
    if (!actionDialog.suggestion) return
    approveMutation.mutate(actionDialog.suggestion)
  }

  const handleReject = () => {
    if (!actionDialog.suggestion || !rejectReason) return
    rejectMutation.mutate({ suggestion: actionDialog.suggestion, reason: rejectReason })
  }

  const getStatusBadgeVariant = (status: SuggestionStatus) => {
    switch (status) {
      case 'pending':
        return 'warning'
      case 'approved':
      case 'auto_applied':
        return 'success'
      case 'rejected':
        return 'destructive'
      default:
        return 'outline'
    }
  }

  const isMutating = approveMutation.isLoading || rejectMutation.isLoading

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Suggestions</h1>
          <p className="text-muted-foreground mt-2">
            Review and approve preference suggestions from agents
          </p>
          {/* V14: Show user role for awareness */}
          {role && (
            <p className="text-sm text-muted-foreground mt-1">
              Logged in as: <Badge variant="outline">{role}</Badge>
              {!canApprove && (
                <span className="ml-2 text-yellow-600">(Read-only access)</span>
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
              <CardTitle>Preference Suggestions</CardTitle>
              <CardDescription>
                AI-generated suggestions for preference changes
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status === 'all' ? 'All Statuses' : status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Agent" />
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
                <TableHead>Current</TableHead>
                <TableHead>Proposed</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading suggestions...
                    </div>
                  </TableCell>
                </TableRow>
              ) : suggestions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    No suggestions found
                  </TableCell>
                </TableRow>
              ) : (
                suggestions.map((suggestion) => (
                  <TableRow key={suggestion.suggestionId}>
                    <TableCell className="font-medium">{suggestion.agentType}</TableCell>
                    <TableCell>{suggestion.preferenceKey}</TableCell>
                    <TableCell>
                      <code className="bg-muted px-2 py-1 rounded text-sm">
                        {String(suggestion.currentValue)}
                      </code>
                    </TableCell>
                    <TableCell>
                      <code className="bg-primary/10 text-primary px-2 py-1 rounded text-sm">
                        {String(suggestion.proposedValue)}
                      </code>
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          suggestion.confidenceScore >= 0.8
                            ? 'text-green-600'
                            : suggestion.confidenceScore >= 0.6
                            ? 'text-yellow-600'
                            : 'text-red-600'
                        }
                      >
                        {(suggestion.confidenceScore * 100).toFixed(0)}%
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(suggestion.status)}>
                        {suggestion.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {suggestion.reason}
                    </TableCell>
                    <TableCell>
                      {/* V14: Role-based UI gating - only show actions if user canApprove */}
                      {suggestion.status === 'pending' && canApprove && (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-green-600"
                            onClick={() =>
                              setActionDialog({
                                open: true,
                                action: 'approve',
                                suggestion,
                              })
                            }
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600"
                            onClick={() =>
                              setActionDialog({
                                open: true,
                                action: 'reject',
                                suggestion,
                              })
                            }
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                      {/* V14: Show disabled state for auditors */}
                      {suggestion.status === 'pending' && !canApprove && (
                        <span className="text-xs text-muted-foreground">No access</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Approve/Reject Dialog */}
      <Dialog
        open={actionDialog.open}
        onOpenChange={(open) => {
          // V14: Prevent closing while mutation is in progress
          if (!open && isMutating) return
          if (!open) {
            setActionDialog({ open: false, action: null, suggestion: null })
            setRejectReason('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog.action === 'approve'
                ? 'Approve Suggestion'
                : 'Reject Suggestion'}
            </DialogTitle>
            <DialogDescription>
              {actionDialog.action === 'approve'
                ? 'This will apply the suggested preference change.'
                : 'Please provide a reason for rejection.'}
            </DialogDescription>
          </DialogHeader>
          {actionDialog.suggestion && (
            <div className="py-4 space-y-4">
              <dl className="space-y-2">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Agent:</dt>
                  <dd className="font-medium">{actionDialog.suggestion.agentType}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Preference:</dt>
                  <dd className="font-medium">{actionDialog.suggestion.preferenceKey}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Change:</dt>
                  <dd>
                    <code className="bg-muted px-2 py-1 rounded mr-2">
                      {String(actionDialog.suggestion.currentValue)}
                    </code>
                    →
                    <code className="bg-primary/10 text-primary px-2 py-1 rounded ml-2">
                      {String(actionDialog.suggestion.proposedValue)}
                    </code>
                  </dd>
                </div>
              </dl>
              {actionDialog.action === 'reject' && (
                <div>
                  <label className="text-sm font-medium">Reason</label>
                  <textarea
                    className="mt-1 w-full p-2 border rounded-md bg-background"
                    rows={3}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Enter reason for rejection..."
                    disabled={isMutating}
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setActionDialog({ open: false, action: null, suggestion: null })
                setRejectReason('')
              }}
              disabled={isMutating}
            >
              Cancel
            </Button>
            {actionDialog.action === 'approve' ? (
              <Button
                onClick={handleApprove}
                disabled={isMutating}
              >
                {/* V14: Double-submit prevention - show loading state */}
                {approveMutation.isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {approveMutation.isLoading ? 'Approving...' : 'Approve'}
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={!rejectReason || isMutating}
              >
                {/* V14: Double-submit prevention - show loading state */}
                {rejectMutation.isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {rejectMutation.isLoading ? 'Rejecting...' : 'Reject'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
