'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { TaskListReadModel, FACET_COLORS, DIFFICULTY_COLORS } from '@/lib/product-types'
import { cn } from '@/lib/utils'
import { Clock, Calendar, AlertCircle } from 'lucide-react'

interface TaskCardProps {
  task: TaskListReadModel
  onComplete?: (taskId: string) => void
  isLoading?: boolean
}

export function TaskCard({ task, onComplete, isLoading }: TaskCardProps) {
  const facetColors = FACET_COLORS[task.goalFacet]
  const difficultyColors = DIFFICULTY_COLORS[task.difficulty]
  const isOverdue = task.status === 'overdue'

  const handleCheckboxChange = () => {
    if (!task.isCompleted && onComplete) {
      onComplete(task.id)
    }
  }

  return (
    <Card className={cn(
      'transition-all',
      task.isCompleted && 'opacity-60',
      isOverdue && !task.isCompleted && 'border-red-300 bg-red-50/50'
    )}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Checkbox
            checked={task.isCompleted}
            disabled={task.isCompleted || isLoading}
            onCheckedChange={handleCheckboxChange}
            className="mt-1"
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className={cn(
                  'font-medium',
                  task.isCompleted && 'line-through text-muted-foreground'
                )}>
                  {task.title}
                </h4>
                <p className="text-sm text-muted-foreground">
                  {task.goalTitle} / {task.subGoalTitle}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {isOverdue && !task.isCompleted && (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                )}
                <Badge className={cn(facetColors.bg, facetColors.text, 'border-0 text-xs')}>
                  {task.goalFacet}
                </Badge>
              </div>
            </div>

            {task.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {task.description}
              </p>
            )}

            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              {task.estimatedDurationMinutes && (
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>{task.estimatedDurationMinutes}min</span>
                </div>
              )}

              {task.deadline && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>{new Date(task.deadline).toLocaleDateString()}</span>
                </div>
              )}

              <Badge variant="outline" className={cn(difficultyColors.bg, difficultyColors.text, 'border-0 text-xs')}>
                {task.difficulty}
              </Badge>

              {task.isScheduled && task.scheduledDate && (
                <Badge variant="secondary" className="text-xs">
                  Scheduled: {task.scheduledDate}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
