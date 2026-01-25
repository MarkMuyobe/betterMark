'use client'

import { Badge } from '@/components/ui/badge'
import { Facet, FACET_COLORS } from '@/lib/product-types'
import { cn } from '@/lib/utils'

interface FacetBadgeProps {
  facet: Facet
  size?: 'sm' | 'default'
  className?: string
}

export function FacetBadge({ facet, size = 'default', className }: FacetBadgeProps) {
  const colors = FACET_COLORS[facet]

  return (
    <Badge
      className={cn(
        colors.bg,
        colors.text,
        'border-0',
        size === 'sm' && 'text-xs px-1.5 py-0.5',
        className
      )}
    >
      {facet}
    </Badge>
  )
}
