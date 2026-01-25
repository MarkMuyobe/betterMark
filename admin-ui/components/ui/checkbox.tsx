'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onCheckedChange?: (checked: boolean) => void
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, disabled, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (onCheckedChange) {
        onCheckedChange(e.target.checked)
      }
    }

    return (
      <div className="relative">
        <input
          type="checkbox"
          ref={ref}
          checked={checked}
          onChange={handleChange}
          disabled={disabled}
          className="sr-only peer"
          {...props}
        />
        <div
          className={cn(
            'h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
            'peer-checked:bg-primary peer-checked:text-primary-foreground',
            'cursor-pointer flex items-center justify-center',
            className
          )}
          onClick={() => {
            if (!disabled && onCheckedChange) {
              onCheckedChange(!checked)
            }
          }}
        >
          {checked && <Check className="h-3 w-3" />}
        </div>
      </div>
    )
  }
)
Checkbox.displayName = 'Checkbox'

export { Checkbox }
