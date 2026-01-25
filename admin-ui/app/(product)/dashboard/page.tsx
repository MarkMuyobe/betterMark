'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TaskCard } from '@/components/product/TaskCard'
import { ProgressRing } from '@/components/product/ProgressRing'
import {
  getGoals,
  getTasks,
  getSchedule,
  getActivitySummary,
  completeTask,
} from '@/lib/product-api'
import type {
  GoalListReadModel,
  TaskListReadModel,
  ScheduleDayReadModel,
  ActivitySummary,
} from '@/lib/product-types'
import { Target, CheckSquare, Calendar, TrendingUp, Plus } from 'lucide-react'
import Link from 'next/link'

export default function DashboardPage() {
  const [goals, setGoals] = useState<GoalListReadModel[]>([])
  const [todaysTasks, setTodaysTasks] = useState<TaskListReadModel[]>([])
  const [schedule, setSchedule] = useState<ScheduleDayReadModel | null>(null)
  const [summary, setSummary] = useState<ActivitySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [completingTask, setCompletingTask] = useState<string | null>(null)

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      setLoading(true)
      const today = new Date().toISOString().split('T')[0]

      const [goalsRes, tasksRes, scheduleRes, summaryRes] = await Promise.all([
        getGoals({ status: 'active', pageSize: 5 }),
        getTasks({ status: 'pending', pageSize: 10 }),
        getSchedule(today),
        getActivitySummary(),
      ])

      setGoals(goalsRes.data)
      setTodaysTasks(tasksRes.data)
      setSchedule(scheduleRes)
      setSummary(summaryRes)
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCompleteTask = async (taskId: string) => {
    try {
      setCompletingTask(taskId)
      await completeTask(taskId)
      setTodaysTasks(prev => prev.filter(t => t.id !== taskId))
      // Reload to update stats
      loadDashboardData()
    } catch (error) {
      console.error('Failed to complete task:', error)
    } finally {
      setCompletingTask(null)
    }
  }

  // Calculate overall progress
  const overallProgress = goals.length > 0
    ? Math.round(goals.reduce((sum, g) => sum + g.progressPercent, 0) / goals.length)
    : 0

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back! Here's your progress today.</p>
        </div>
        <Link href="/goals/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Goal
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Goals</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{goals.length}</div>
            <p className="text-xs text-muted-foreground">
              {goals.filter(g => g.progressPercent >= 50).length} past halfway
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Tasks</CardTitle>
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{todaysTasks.length}</div>
            <p className="text-xs text-muted-foreground">
              {todaysTasks.filter(t => t.status === 'overdue').length} overdue
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Schedule</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{schedule?.blocks.length ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              {schedule?.totalScheduledMinutes ?? 0} minutes planned
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Week</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.taskCompletions ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              tasks completed, {summary?.totalMinutes ?? 0} min logged
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Progress Overview */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Overall Progress</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <ProgressRing progress={overallProgress} size={160} />
            <p className="mt-4 text-sm text-muted-foreground text-center">
              Average progress across {goals.length} active goals
            </p>
          </CardContent>
        </Card>

        {/* Today's Tasks */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Pending Tasks</CardTitle>
            <Link href="/tasks">
              <Button variant="ghost" size="sm">View All</Button>
            </Link>
          </CardHeader>
          <CardContent>
            {todaysTasks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No pending tasks!</p>
                <p className="text-sm">Great job, you're all caught up.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {todaysTasks.slice(0, 5).map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onComplete={handleCompleteTask}
                    isLoading={completingTask === task.id}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link href="/goals/new">
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardContent className="p-6 flex flex-col items-center justify-center text-center">
              <Target className="h-8 w-8 mb-2 text-muted-foreground" />
              <span className="font-medium">Create Goal</span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/tasks">
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardContent className="p-6 flex flex-col items-center justify-center text-center">
              <CheckSquare className="h-8 w-8 mb-2 text-muted-foreground" />
              <span className="font-medium">View Tasks</span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/schedule">
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardContent className="p-6 flex flex-col items-center justify-center text-center">
              <Calendar className="h-8 w-8 mb-2 text-muted-foreground" />
              <span className="font-medium">Plan Day</span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/logs">
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardContent className="p-6 flex flex-col items-center justify-center text-center">
              <TrendingUp className="h-8 w-8 mb-2 text-muted-foreground" />
              <span className="font-medium">View Activity</span>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  )
}
