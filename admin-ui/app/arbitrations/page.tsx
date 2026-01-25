'use client'

import { useEffect, useState } from 'react'
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
import {
  getArbitrations,
  getPendingEscalations,
  approveEscalation,
  rejectEscalation,
} from '@/lib/api'
import type { ArbitrationDecisionReadModel } from '@/lib/types'
import { RefreshCw, Check, X, AlertTriangle, Eye } from 'lucide-react'
import Link from 'next/link'

export default function ArbitrationsPage() {
  const [arbitrations, setArbitrations] = useState<ArbitrationDecisionReadModel[]>([])
  const [pendingEscalations, setPendingEscalations] = useState<ArbitrationDecisionReadModel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [actionDialog, setActionDialog] = useState<{
    open: boolean
    action: 'approve' | 'reject' | null
    decision: ArbitrationDecisionReadModel | null
  }>({ open: false, action: null, decision: null })
  const [rejectReason, setRejectReason] = useState('')

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [arbResponse, escResponse] = await Promise.all([
        getArbitrations(filter !== 'all' ? { escalated: filter === 'escalated' } : {}),
        getPendingEscalations(),
      ])
      setArbitrations(arbResponse.data)
      setPendingEscalations(escResponse.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [filter])

  const handleApprove = async () => {
    if (!actionDialog.decision) return

    try {
      const result = await approveEscalation(actionDialog.decision.decisionId, 'admin')
      if (result.success) {
        fetchData()
      } else {
        setError(result.error || 'Approval failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed')
    } finally {
      setActionDialog({ open: false, action: null, decision: null })
    }
  }

  const handleReject = async () => {
    if (!actionDialog.decision || !rejectReason) return

    try {
      const result = await rejectEscalation(
        actionDialog.decision.decisionId,
        rejectReason,
        'admin'
      )
      if (result.success) {
        fetchData()
        setRejectReason('')
      } else {
        setError(result.error || 'Rejection failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rejection failed')
    } finally {
      setActionDialog({ open: false, action: null, decision: null })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Arbitrations</h1>
          <p className="text-muted-foreground mt-2">
            Monitor arbitration decisions and handle escalations
          </p>
        </div>
        <Button variant="outline" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Pending Escalations Alert */}
      {pendingEscalations.length > 0 && (
        <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-yellow-700 dark:text-yellow-300">
              <AlertTriangle className="h-5 w-5" />
              Pending Escalations ({pendingEscalations.length})
            </CardTitle>
            <CardDescription className="text-yellow-600 dark:text-yellow-400">
              The following decisions require your approval
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingEscalations.map((decision) => (
                <div
                  key={decision.decisionId}
                  className="flex items-center justify-between p-3 bg-background rounded-md"
                >
                  <div>
                    <span className="font-medium">{decision.decisionId.slice(0, 8)}...</span>
                    <span className="text-muted-foreground ml-2">
                      {decision.reasoningSummary}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setActionDialog({ open: true, action: 'approve', decision })
                      }
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600"
                      onClick={() =>
                        setActionDialog({ open: true, action: 'reject', decision })
                      }
                    >
                      <X className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Arbitrations */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Arbitration Decisions</CardTitle>
              <CardDescription>
                History of conflict resolution between agents
              </CardDescription>
            </div>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Decisions</SelectItem>
                <SelectItem value="escalated">Escalated Only</SelectItem>
                <SelectItem value="resolved">Resolved Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="bg-destructive/10 text-destructive p-4 rounded-md mb-4">
              {error}
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Decision ID</TableHead>
                <TableHead>Winner</TableHead>
                <TableHead>Strategy</TableHead>
                <TableHead>Suppressed</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Resolved At</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    Loading arbitrations...
                  </TableCell>
                </TableRow>
              ) : arbitrations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    No arbitration decisions found
                  </TableCell>
                </TableRow>
              ) : (
                arbitrations.map((decision) => (
                  <TableRow key={decision.decisionId}>
                    <TableCell className="font-mono text-sm">
                      {decision.decisionId.slice(0, 8)}...
                    </TableCell>
                    <TableCell>
                      {decision.winningAgent ? (
                        <Badge variant="secondary">{decision.winningAgent}</Badge>
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </TableCell>
                    <TableCell>{decision.strategyUsed}</TableCell>
                    <TableCell>
                      {decision.suppressedAgents.length > 0
                        ? decision.suppressedAgents.join(', ')
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {decision.escalated ? (
                        <Badge variant="warning">Escalated</Badge>
                      ) : decision.executed ? (
                        <Badge variant="success">Executed</Badge>
                      ) : (
                        <Badge variant="outline">Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(decision.resolvedAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Link href={`/explanations/${decision.decisionId}`}>
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4 mr-1" />
                          Details
                        </Button>
                      </Link>
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
          if (!open) {
            setActionDialog({ open: false, action: null, decision: null })
            setRejectReason('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog.action === 'approve'
                ? 'Approve Escalated Decision'
                : 'Reject Escalated Decision'}
            </DialogTitle>
            <DialogDescription>
              {actionDialog.action === 'approve'
                ? 'This will execute the winning proposal.'
                : 'This will reject all proposals in this conflict.'}
            </DialogDescription>
          </DialogHeader>
          {actionDialog.decision && (
            <div className="py-4 space-y-4">
              <dl className="space-y-2">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Decision:</dt>
                  <dd className="font-mono">{actionDialog.decision.decisionId.slice(0, 12)}...</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Winner:</dt>
                  <dd className="font-medium">
                    {actionDialog.decision.winningAgent || 'None'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Reason:</dt>
                  <dd>{actionDialog.decision.reasoningSummary}</dd>
                </div>
              </dl>
              {actionDialog.action === 'reject' && (
                <div>
                  <label className="text-sm font-medium">Rejection Reason</label>
                  <textarea
                    className="mt-1 w-full p-2 border rounded-md bg-background"
                    rows={3}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Enter reason for rejection..."
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setActionDialog({ open: false, action: null, decision: null })
                setRejectReason('')
              }}
            >
              Cancel
            </Button>
            {actionDialog.action === 'approve' ? (
              <Button onClick={handleApprove}>Approve & Execute</Button>
            ) : (
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={!rejectReason}
              >
                Reject All
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
