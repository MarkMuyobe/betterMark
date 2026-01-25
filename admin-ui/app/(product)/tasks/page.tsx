'use client'

import { useEffect, useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TaskCard } from '@/components/product/TaskCard'
import { getTasks, completeTask } from '@/lib/product-api'
import type { TaskListReadModel, TaskStatus } from '@/lib/product-types'
import { CheckSquare } from 'lucide-react'

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskListReadModel[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('pending')
  const [completingTask, setCompletingTask] = useState<string | null>(null)

  useEffect(() => {
    loadTasks()
  }, [statusFilter])

  const loadTasks = async () => {
    try {
      setLoading(true)
      const params: { status?: TaskStatus } = {}
      if (statusFilter !== 'all') {
        params.status = statusFilter as TaskStatus
      }

      const res = await getTasks(params)
      setTasks(res.data)
    } catch (error) {
      console.error('Failed to load tasks:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCompleteTask = async (taskId: string) => {
    try {
      setCompletingTask(taskId)
      await completeTask(taskId)
      // Remove completed task from list if we're filtering pending
      if (statusFilter === 'pending') {
        setTasks(prev => prev.filter(t => t.id !== taskId))
      } else {
        loadTasks()
      }
    } catch (error) {
      console.error('Failed to complete task:', error)
    } finally {
      setCompletingTask(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tasks</h1>
          <p className="text-muted-foreground">View and manage all your tasks</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tasks</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tasks List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-16">
          <CheckSquare className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h2 className="text-xl font-semibold mb-2">No tasks found</h2>
          <p className="text-muted-foreground">
            {statusFilter === 'pending'
              ? 'Great job! You have no pending tasks.'
              : 'No tasks match the current filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onComplete={handleCompleteTask}
              isLoading={completingTask === task.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}
