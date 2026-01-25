'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { GoalListReadModel, FACET_COLORS, DIFFICULTY_COLORS } from '@/lib/product-types'
import { cn } from '@/lib/utils'
import { Target, CheckCircle2 } from 'lucide-react'

interface GoalCardProps {
  goal: GoalListReadModel
}

export function GoalCard({ goal }: GoalCardProps) {
  const facetColors = FACET_COLORS[goal.facet]
  const difficultyColors = DIFFICULTY_COLORS[goal.difficulty]

  return (
    <Link href={`/goals/${goal.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              {goal.isCompleted ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <Target className="h-5 w-5 text-muted-foreground" />
              )}
              <CardTitle className="text-lg">{goal.title}</CardTitle>
            </div>
            <Badge className={cn(facetColors.bg, facetColors.text, 'border-0')}>
              {goal.facet}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {goal.description && (
            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
              {goal.description}
            </p>
          )}

          <div className="space-y-3">
            {/* Progress bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium">{goal.progressPercent}%</span>
              </div>
              <Progress value={goal.progressPercent} className="h-2" />
            </div>

            {/* Stats */}
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-4">
                <span className="text-muted-foreground">
                  {goal.completedTaskCount}/{goal.taskCount} tasks
                </span>
                <span className="text-muted-foreground">
                  {goal.subGoalCount} subgoals
                </span>
              </div>
              <Badge variant="outline" className={cn(difficultyColors.bg, difficultyColors.text, 'border-0')}>
                {goal.difficulty}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
