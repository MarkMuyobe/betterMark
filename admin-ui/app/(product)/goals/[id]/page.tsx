'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { TaskCard } from '@/components/product/TaskCard'
import { FacetBadge } from '@/components/product/FacetBadge'
import { getGoal, createSubGoal, createTask, completeTask } from '@/lib/product-api'
import type { GoalDetailReadModel, SubGoalWithTasks, DifficultyProfile } from '@/lib/product-types'
import { DIFFICULTY_COLORS } from '@/lib/product-types'
import { cn } from '@/lib/utils'
import {
  ArrowLeft,
  Plus,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Target,
} from 'lucide-react'
import Link from 'next/link'

export default function GoalDetailPage() {
  const params = useParams()
  const router = useRouter()
  const goalId = params.id as string

  const [goal, setGoal] = useState<GoalDetailReadModel | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedSubGoals, setExpandedSubGoals] = useState<Set<string>>(new Set())
  const [completingTask, setCompletingTask] = useState<string | null>(null)

  // New subgoal form
  const [showNewSubGoal, setShowNewSubGoal] = useState(false)
  const [newSubGoalTitle, setNewSubGoalTitle] = useState('')
  const [creatingSubGoal, setCreatingSubGoal] = useState(false)

  // New task form
  const [showNewTask, setShowNewTask] = useState<string | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [creatingTask, setCreatingTask] = useState(false)

  useEffect(() => {
    loadGoal()
  }, [goalId])

  const loadGoal = async () => {
    try {
      setLoading(true)
      const data = await getGoal(goalId)
      setGoal(data)
      // Expand all subgoals by default
      setExpandedSubGoals(new Set(data.subGoals.map(sg => sg.id)))
    } catch (error) {
      console.error('Failed to load goal:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleSubGoal = (subGoalId: string) => {
    setExpandedSubGoals(prev => {
      const next = new Set(prev)
      if (next.has(subGoalId)) {
        next.delete(subGoalId)
      } else {
        next.add(subGoalId)
      }
      return next
    })
  }

  const handleCreateSubGoal = async () => {
    if (!newSubGoalTitle.trim()) return
    try {
      setCreatingSubGoal(true)
      await createSubGoal({
        goalId,
        title: newSubGoalTitle.trim(),
      })
      setNewSubGoalTitle('')
      setShowNewSubGoal(false)
      loadGoal()
    } catch (error) {
      console.error('Failed to create subgoal:', error)
    } finally {
      setCreatingSubGoal(false)
    }
  }

  const handleCreateTask = async (subGoalId: string) => {
    if (!newTaskTitle.trim()) return
    try {
      setCreatingTask(true)
      await createTask({
        subGoalId,
        title: newTaskTitle.trim(),
      })
      setNewTaskTitle('')
      setShowNewTask(null)
      loadGoal()
    } catch (error) {
      console.error('Failed to create task:', error)
    } finally {
      setCreatingTask(false)
    }
  }

  const handleCompleteTask = async (taskId: string) => {
    try {
      setCompletingTask(taskId)
      await completeTask(taskId)
      loadGoal()
    } catch (error) {
      console.error('Failed to complete task:', error)
    } finally {
      setCompletingTask(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!goal) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-semibold mb-2">Goal not found</h2>
        <Link href="/goals">
          <Button>Back to Goals</Button>
        </Link>
      </div>
    )
  }

  const difficultyColors = DIFFICULTY_COLORS[goal.difficulty]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Link href="/goals">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3 mb-2">
              {goal.isCompleted ? (
                <CheckCircle2 className="h-6 w-6 text-green-500" />
              ) : (
                <Target className="h-6 w-6 text-muted-foreground" />
              )}
              <h1 className="text-2xl font-bold">{goal.title}</h1>
            </div>
            <div className="flex items-center gap-2">
              <FacetBadge facet={goal.facet} />
              <Badge variant="outline" className={cn(difficultyColors.bg, difficultyColors.text, 'border-0')}>
                {goal.difficulty}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      {goal.description && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">{goal.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Progress Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between text-sm">
              <span>{goal.completedTaskCount} of {goal.totalTaskCount} tasks completed</span>
              <span className="font-medium">{goal.progressPercent}%</span>
            </div>
            <Progress value={goal.progressPercent} className="h-3" />
          </div>
        </CardContent>
      </Card>

      {/* SubGoals */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">SubGoals</h2>
          <Dialog open={showNewSubGoal} onOpenChange={setShowNewSubGoal}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add SubGoal
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New SubGoal</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="subgoal-title">Title</Label>
                  <Input
                    id="subgoal-title"
                    value={newSubGoalTitle}
                    onChange={e => setNewSubGoalTitle(e.target.value)}
                    placeholder="Enter subgoal title"
                    onKeyDown={e => e.key === 'Enter' && handleCreateSubGoal()}
                  />
                </div>
                <Button
                  onClick={handleCreateSubGoal}
                  disabled={!newSubGoalTitle.trim() || creatingSubGoal}
                  className="w-full"
                >
                  {creatingSubGoal ? 'Creating...' : 'Create SubGoal'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {goal.subGoals.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <p>No subgoals yet. Add one to break down your goal into smaller steps.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {goal.subGoals.map(subGoal => (
              <SubGoalCard
                key={subGoal.id}
                subGoal={subGoal}
                expanded={expandedSubGoals.has(subGoal.id)}
                onToggle={() => toggleSubGoal(subGoal.id)}
                onCompleteTask={handleCompleteTask}
                completingTask={completingTask}
                showNewTask={showNewTask === subGoal.id}
                onShowNewTask={() => setShowNewTask(showNewTask === subGoal.id ? null : subGoal.id)}
                newTaskTitle={newTaskTitle}
                onNewTaskTitleChange={setNewTaskTitle}
                onCreateTask={() => handleCreateTask(subGoal.id)}
                creatingTask={creatingTask}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface SubGoalCardProps {
  subGoal: SubGoalWithTasks
  expanded: boolean
  onToggle: () => void
  onCompleteTask: (taskId: string) => void
  completingTask: string | null
  showNewTask: boolean
  onShowNewTask: () => void
  newTaskTitle: string
  onNewTaskTitleChange: (value: string) => void
  onCreateTask: () => void
  creatingTask: boolean
}

function SubGoalCard({
  subGoal,
  expanded,
  onToggle,
  onCompleteTask,
  completingTask,
  showNewTask,
  onShowNewTask,
  newTaskTitle,
  onNewTaskTitleChange,
  onCreateTask,
  creatingTask,
}: SubGoalCardProps) {
  return (
    <Card>
      <CardHeader
        className="cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <div>
              <CardTitle className={cn('text-base', subGoal.isCompleted && 'line-through text-muted-foreground')}>
                {subGoal.title}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {subGoal.tasks.filter(t => t.isCompleted).length}/{subGoal.tasks.length} tasks
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Progress value={subGoal.progressPercent} className="w-24 h-2" />
            <span className="text-sm text-muted-foreground">{subGoal.progressPercent}%</span>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent>
          <div className="space-y-3">
            {subGoal.tasks.map(task => (
              <div key={task.id} className="pl-4">
                <Card className={cn(
                  'transition-all',
                  task.isCompleted && 'opacity-60'
                )}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={task.isCompleted}
                        disabled={task.isCompleted || completingTask === task.id}
                        onChange={() => onCompleteTask(task.id)}
                        className="h-4 w-4"
                      />
                      <span className={cn(
                        'flex-1',
                        task.isCompleted && 'line-through text-muted-foreground'
                      )}>
                        {task.title}
                      </span>
                      {task.estimatedDurationMinutes && (
                        <span className="text-xs text-muted-foreground">
                          {task.estimatedDurationMinutes}min
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))}

            {/* Add Task Form */}
            {showNewTask ? (
              <div className="pl-4 flex gap-2">
                <Input
                  value={newTaskTitle}
                  onChange={e => onNewTaskTitleChange(e.target.value)}
                  placeholder="Task title"
                  onKeyDown={e => e.key === 'Enter' && onCreateTask()}
                  autoFocus
                />
                <Button
                  onClick={onCreateTask}
                  disabled={!newTaskTitle.trim() || creatingTask}
                  size="sm"
                >
                  Add
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onShowNewTask}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="ml-4"
                onClick={e => {
                  e.stopPropagation()
                  onShowNewTask()
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Task
              </Button>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
}
