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
import { getAuditTrail } from '@/lib/api'
import type { AuditTrailReadModel, AuditRecordType, AuditOutcome } from '@/lib/types'
import { RefreshCw, Eye, Scale, Settings, RotateCcw } from 'lucide-react'
import Link from 'next/link'

const recordTypes: (AuditRecordType | 'all')[] = ['all', 'arbitration', 'adaptation', 'rollback']
const agents = ['all', 'CoachAgent', 'PlannerAgent', 'LoggerAgent']

export default function AuditPage() {
  const [auditTrail, setAuditTrail] = useState<AuditTrailReadModel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<string>('all')
  const [selectedAgent, setSelectedAgent] = useState<string>('all')

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string> = {}
      if (selectedType !== 'all') params.type = selectedType
      if (selectedAgent !== 'all') params.agent = selectedAgent
      const response = await getAuditTrail(params)
      setAuditTrail(response.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit trail')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [selectedType, selectedAgent])

  const getTypeIcon = (type: AuditRecordType) => {
    switch (type) {
      case 'arbitration':
        return <Scale className="h-4 w-4" />
      case 'adaptation':
        return <Settings className="h-4 w-4" />
      case 'rollback':
        return <RotateCcw className="h-4 w-4" />
      default:
        return null
    }
  }

  const getOutcomeBadgeVariant = (outcome: AuditOutcome) => {
    switch (outcome) {
      case 'success':
        return 'success'
      case 'blocked':
        return 'destructive'
      case 'escalated':
        return 'warning'
      case 'rolled_back':
        return 'secondary'
      default:
        return 'outline'
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Audit Trail</h1>
          <p className="text-muted-foreground mt-2">
            Review system activity and changes
          </p>
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
              <CardTitle>Activity Log</CardTitle>
              <CardDescription>
                Chronological record of all system changes
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  {recordTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type === 'all' ? 'All Types' : type}
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
          {error && (
            <div className="bg-destructive/10 text-destructive p-4 rounded-md mb-4">
              {error}
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    Loading audit trail...
                  </TableCell>
                </TableRow>
              ) : auditTrail.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    No audit records found
                  </TableCell>
                </TableRow>
              ) : (
                auditTrail.map((record) => (
                  <TableRow key={record.recordId}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getTypeIcon(record.type)}
                        <span className="capitalize">{record.type}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{record.agentType}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {record.targetRef.key || record.targetRef.id.slice(0, 12)}
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate">
                      {record.actionSummary}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getOutcomeBadgeVariant(record.outcome)}>
                        {record.outcome.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(record.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Link href={`/explanations/${record.recordId}`}>
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
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
    </div>
  )
}
