'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getSchedule, deleteScheduleBlock } from '@/lib/product-api'
import type { ScheduleDayReadModel, ScheduleBlockReadModel } from '@/lib/product-types'
import { FACET_COLORS } from '@/lib/product-types'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, Clock, AlertTriangle, Trash2 } from 'lucide-react'

export default function SchedulePage() {
  const [schedule, setSchedule] = useState<ScheduleDayReadModel | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [deletingBlock, setDeletingBlock] = useState<string | null>(null)

  useEffect(() => {
    loadSchedule()
  }, [currentDate])

  const loadSchedule = async () => {
    try {
      setLoading(true)
      const dateStr = currentDate.toISOString().split('T')[0]
      const data = await getSchedule(dateStr)
      setSchedule(data)
    } catch (error) {
      console.error('Failed to load schedule:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteBlock = async (blockId: string) => {
    try {
      setDeletingBlock(blockId)
      await deleteScheduleBlock(blockId)
      loadSchedule()
    } catch (error) {
      console.error('Failed to delete block:', error)
    } finally {
      setDeletingBlock(null)
    }
  }

  const goToPreviousDay = () => {
    setCurrentDate(prev => {
      const next = new Date(prev)
      next.setDate(next.getDate() - 1)
      return next
    })
  }

  const goToNextDay = () => {
    setCurrentDate(prev => {
      const next = new Date(prev)
      next.setDate(next.getDate() + 1)
      return next
    })
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  }

  const isToday = currentDate.toDateString() === new Date().toDateString()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Schedule</h1>
          <p className="text-muted-foreground">Plan and organize your day</p>
        </div>
      </div>

      {/* Date Navigation */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={goToPreviousDay}>
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="flex items-center gap-4">
              <h2 className="text-lg font-semibold">
                {currentDate.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </h2>
              {!isToday && (
                <Button variant="outline" size="sm" onClick={goToToday}>
                  Today
                </Button>
              )}
            </div>

            <Button variant="ghost" size="icon" onClick={goToNextDay}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Schedule Stats */}
      {schedule && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{schedule.blocks.length}</div>
              <p className="text-xs text-muted-foreground">Scheduled blocks</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{schedule.totalScheduledMinutes}</div>
              <p className="text-xs text-muted-foreground">Minutes scheduled</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{schedule.availableSlots.length}</div>
              <p className="text-xs text-muted-foreground">Available slots</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className={cn(
                'text-2xl font-bold',
                schedule.conflicts.length > 0 && 'text-red-500'
              )}>
                {schedule.conflicts.length}
              </div>
              <p className="text-xs text-muted-foreground">Conflicts</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Conflicts Warning */}
      {schedule && schedule.conflicts.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" />
              Schedule Conflicts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {schedule.conflicts.map((conflict, i) => (
                <li key={i} className="text-sm text-red-700">
                  {conflict.description}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Schedule Timeline */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : schedule && schedule.blocks.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Clock className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <h2 className="text-xl font-semibold mb-2">No scheduled blocks</h2>
            <p>Your schedule is clear for this day.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {schedule?.blocks.map(block => (
                <ScheduleBlockCard
                  key={block.id}
                  block={block}
                  onDelete={handleDeleteBlock}
                  isDeleting={deletingBlock === block.id}
                  formatTime={formatTime}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Available Slots */}
      {schedule && schedule.availableSlots.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Available Time Slots</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {schedule.availableSlots.map((slot, i) => (
                <div
                  key={i}
                  className="p-3 rounded-md border border-dashed bg-muted/30"
                >
                  <div className="text-sm font-medium">
                    {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {slot.durationMinutes} minutes available
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

interface ScheduleBlockCardProps {
  block: ScheduleBlockReadModel
  onDelete: (id: string) => void
  isDeleting: boolean
  formatTime: (iso: string) => string
}

function ScheduleBlockCard({ block, onDelete, isDeleting, formatTime }: ScheduleBlockCardProps) {
  const facetColors = block.goalFacet ? FACET_COLORS[block.goalFacet] : null

  return (
    <div className={cn(
      'flex items-center justify-between p-4 rounded-lg border',
      block.isFixed && 'bg-muted/50',
      block.taskIsCompleted && 'opacity-60'
    )}>
      <div className="flex items-center gap-4">
        <div className="text-sm font-medium text-muted-foreground min-w-[140px]">
          {formatTime(block.startTime)} - {formatTime(block.endTime)}
        </div>

        <div>
          <div className="flex items-center gap-2">
            <span className={cn(
              'font-medium',
              block.taskIsCompleted && 'line-through'
            )}>
              {block.label}
            </span>
            {block.isFixed && (
              <Badge variant="secondary" className="text-xs">Fixed</Badge>
            )}
          </div>

          {block.goalTitle && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-muted-foreground">{block.goalTitle}</span>
              {facetColors && (
                <Badge className={cn(facetColors.bg, facetColors.text, 'border-0 text-xs')}>
                  {block.goalFacet}
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>

      {!block.isFixed && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(block.id)}
          disabled={isDeleting}
        >
          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-red-500" />
        </Button>
      )}
    </div>
  )
}
