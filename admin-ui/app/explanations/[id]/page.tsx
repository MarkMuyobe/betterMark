'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getExplanation } from '@/lib/api'
import type { Explanation } from '@/lib/types'
import { ArrowLeft, ThumbsUp, ThumbsDown, Minus } from 'lucide-react'

export default function ExplanationPage() {
  const params = useParams()
  const router = useRouter()
  const [explanation, setExplanation] = useState<Explanation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const decisionId = params.id as string

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await getExplanation(decisionId)
        if (response.success && response.data) {
          setExplanation(response.data)
        } else {
          setError(response.error || 'Failed to load explanation')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load explanation')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [decisionId])

  const getImpactIcon = (impact: string) => {
    switch (impact) {
      case 'positive':
        return <ThumbsUp className="h-4 w-4 text-green-500" />
      case 'negative':
        return <ThumbsDown className="h-4 w-4 text-red-500" />
      default:
        return <Minus className="h-4 w-4 text-gray-500" />
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading explanation...</div>
      </div>
    )
  }

  if (error || !explanation) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-destructive">
              {error || 'Explanation not found'}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Decision Explanation</h1>
          <p className="text-muted-foreground mt-1">
            Understanding why this decision was made
          </p>
        </div>
      </div>

      {/* Summary */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Summary</CardTitle>
            <Badge variant="secondary" className="capitalize">
              {explanation.decisionType}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-lg">{explanation.summary}</p>
          <p className="text-sm text-muted-foreground mt-2">
            Decided at: {new Date(explanation.decidedAt).toLocaleString()}
          </p>
        </CardContent>
      </Card>

      {/* Contributing Factors */}
      <Card>
        <CardHeader>
          <CardTitle>Contributing Factors</CardTitle>
          <CardDescription>
            What influenced this decision
          </CardDescription>
        </CardHeader>
        <CardContent>
          {explanation.contributingFactors.length === 0 ? (
            <p className="text-muted-foreground">No contributing factors recorded</p>
          ) : (
            <div className="space-y-4">
              {explanation.contributingFactors.map((factor, index) => (
                <div
                  key={index}
                  className="flex items-start gap-4 p-4 border rounded-lg"
                >
                  <div className="mt-1">{getImpactIcon(factor.impact)}</div>
                  <div className="flex-1">
                    <div className="font-medium">{factor.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {factor.description}
                    </div>
                    <div className="text-sm mt-1">
                      Value:{' '}
                      <code className="bg-muted px-2 py-1 rounded">
                        {String(factor.value)}
                      </code>
                    </div>
                  </div>
                  <Badge
                    variant={
                      factor.impact === 'positive'
                        ? 'success'
                        : factor.impact === 'negative'
                        ? 'destructive'
                        : 'outline'
                    }
                  >
                    {factor.impact}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Policies Involved */}
      <Card>
        <CardHeader>
          <CardTitle>Policies Involved</CardTitle>
          <CardDescription>
            Policies that affected this decision
          </CardDescription>
        </CardHeader>
        <CardContent>
          {explanation.policiesInvolved.length === 0 ? (
            <p className="text-muted-foreground">No policies involved</p>
          ) : (
            <div className="space-y-3">
              {explanation.policiesInvolved.map((policy, index) => (
                <div key={index} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{policy.policyName}</div>
                    <code className="text-xs bg-muted px-2 py-1 rounded">
                      {policy.policyId}
                    </code>
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {policy.effect}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Alternatives Considered */}
      {explanation.alternativesConsidered.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Alternatives Considered</CardTitle>
            <CardDescription>
              Other proposals that were evaluated
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {explanation.alternativesConsidered.map((alt, index) => (
                <div key={index} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary">{alt.agentName}</Badge>
                    {alt.score !== undefined && (
                      <span className="text-sm text-muted-foreground">
                        Score: {alt.score}
                      </span>
                    )}
                    {alt.priority !== undefined && (
                      <span className="text-sm text-muted-foreground">
                        Priority: {alt.priority}
                      </span>
                    )}
                  </div>
                  <div className="text-sm mt-2">{alt.proposedAction}</div>
                  <div className="text-sm text-red-600 mt-1">
                    Not chosen: {alt.whyNotChosen}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Why Others Lost */}
      {explanation.whyOthersLost.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Detailed Loss Explanations</CardTitle>
            <CardDescription>
              Why other proposals did not win
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {explanation.whyOthersLost.map((loss, index) => (
                <div key={index} className="p-4 border border-red-200 rounded-lg bg-red-50 dark:bg-red-950 dark:border-red-900">
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive">{loss.agentName}</Badge>
                    <code className="text-xs text-muted-foreground">
                      {loss.proposalId.slice(0, 12)}...
                    </code>
                  </div>
                  <div className="font-medium text-red-700 dark:text-red-300 mt-2">
                    {loss.reason}
                  </div>
                  <div className="text-sm text-red-600 dark:text-red-400 mt-1">
                    {loss.details}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
