'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Settings } from 'lucide-react'

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your preferences</p>
      </div>

      {/* General Settings */}
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Basic application settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Theme</Label>
              <p className="text-sm text-muted-foreground">
                Choose your preferred color scheme
              </p>
            </div>
            <select className="rounded-md border px-3 py-2 text-sm">
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Schedule Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
          <CardDescription>Configure your daily schedule preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Day Start Time</Label>
              <p className="text-sm text-muted-foreground">
                When your productive day begins
              </p>
            </div>
            <input type="time" defaultValue="06:00" className="rounded-md border px-3 py-2 text-sm" />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Day End Time</Label>
              <p className="text-sm text-muted-foreground">
                When your productive day ends
              </p>
            </div>
            <input type="time" defaultValue="22:00" className="rounded-md border px-3 py-2 text-sm" />
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Control how you receive updates</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Task Reminders</Label>
              <p className="text-sm text-muted-foreground">
                Get reminded about upcoming tasks
              </p>
            </div>
            <input type="checkbox" defaultChecked className="rounded" />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Daily Summary</Label>
              <p className="text-sm text-muted-foreground">
                Receive a daily progress summary
              </p>
            </div>
            <input type="checkbox" defaultChecked className="rounded" />
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 text-muted-foreground">
            <Settings className="h-5 w-5" />
            <div>
              <p className="font-medium text-foreground">BetterMark</p>
              <p className="text-sm">V15 Product UI - Goal Management System</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
