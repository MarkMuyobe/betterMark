'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createGoal } from '@/lib/product-api'
import type { Facet, DifficultyProfile } from '@/lib/product-types'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

const FACETS: Facet[] = ['Health', 'Finance', 'Career', 'Education', 'Business', 'Relationships', 'Habits', 'Mentality']
const DIFFICULTIES: DifficultyProfile[] = ['Easy', 'Medium', 'Hard', 'Expert']

export default function NewGoalPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [facet, setFacet] = useState<Facet | ''>('')
  const [difficulty, setDifficulty] = useState<DifficultyProfile | ''>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!title.trim()) {
      setError('Title is required')
      return
    }
    if (!facet) {
      setError('Please select a facet')
      return
    }
    if (!difficulty) {
      setError('Please select a difficulty')
      return
    }

    try {
      setLoading(true)
      const goal = await createGoal({
        title: title.trim(),
        description: description.trim() || undefined,
        facet,
        difficulty,
      })
      router.push(`/goals/${goal.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create goal')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/goals">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Create New Goal</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Goal Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Enter goal title"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What do you want to achieve?"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Facet *</Label>
                <Select value={facet} onValueChange={v => setFacet(v as Facet)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select facet" />
                  </SelectTrigger>
                  <SelectContent>
                    {FACETS.map(f => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Difficulty *</Label>
                <Select value={difficulty} onValueChange={v => setDifficulty(v as DifficultyProfile)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select difficulty" />
                  </SelectTrigger>
                  <SelectContent>
                    {DIFFICULTIES.map(d => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Link href="/goals">
                <Button type="button" variant="outline">Cancel</Button>
              </Link>
              <Button type="submit" disabled={loading}>
                {loading ? 'Creating...' : 'Create Goal'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
