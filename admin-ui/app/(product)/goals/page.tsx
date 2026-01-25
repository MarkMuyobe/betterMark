'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { GoalCard } from '@/components/product/GoalCard'
import { getGoals } from '@/lib/product-api'
import type { GoalListReadModel, Facet } from '@/lib/product-types'
import { Plus, Target } from 'lucide-react'
import Link from 'next/link'

const FACETS: Facet[] = ['Health', 'Finance', 'Career', 'Education', 'Business', 'Relationships', 'Habits', 'Mentality']

export default function GoalsPage() {
  const [goals, setGoals] = useState<GoalListReadModel[]>([])
  const [loading, setLoading] = useState(true)
  const [facetFilter, setFacetFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('active')

  useEffect(() => {
    loadGoals()
  }, [facetFilter, statusFilter])

  const loadGoals = async () => {
    try {
      setLoading(true)
      const params: { facet?: Facet; status?: 'active' | 'completed' | 'all' } = {}
      if (facetFilter !== 'all') {
        params.facet = facetFilter as Facet
      }
      if (statusFilter !== 'all') {
        params.status = statusFilter as 'active' | 'completed'
      }

      const res = await getGoals(params)
      setGoals(res.data)
    } catch (error) {
      console.error('Failed to load goals:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Goals</h1>
          <p className="text-muted-foreground">Manage your goals and track progress</p>
        </div>
        <Link href="/goals/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Goal
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <Select value={facetFilter} onValueChange={setFacetFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by facet" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Facets</SelectItem>
            {FACETS.map(facet => (
              <SelectItem key={facet} value={facet}>{facet}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Goals Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : goals.length === 0 ? (
        <div className="text-center py-16">
          <Target className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h2 className="text-xl font-semibold mb-2">No goals yet</h2>
          <p className="text-muted-foreground mb-6">
            Get started by creating your first goal
          </p>
          <Link href="/goals/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Goal
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {goals.map(goal => (
            <GoalCard key={goal.id} goal={goal} />
          ))}
        </div>
      )}
    </div>
  )
}
