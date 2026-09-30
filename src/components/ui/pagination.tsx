'use client'

import * as React from 'react'
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils/helpers'
import { buttonVariants } from '@/components/ui/button'

const Pagination = ({ className, ...props }: React.ComponentProps<'nav'>) => (
  <nav
    role="navigation"
    aria-label="Pagination"
    className={cn('flex items-center justify-center gap-2', className)}
    {...props}
  />
)
Pagination.displayName = 'Pagination'

/** Wrapper for the numbered page links. */
const PaginationList = React.forwardRef<HTMLUListElement, React.ComponentProps<'ul'>>(
  ({ className, ...props }, ref) => (
    <ul ref={ref} className={cn('flex flex-row items-center gap-1', className)} {...props} />
  )
)
PaginationList.displayName = 'PaginationList'

/** Alias kept for shadcn-compatible call sites. */
const PaginationContent = PaginationList

const PaginationItem = React.forwardRef<HTMLLIElement, React.ComponentProps<'li'>>(
  ({ className, ...props }, ref) => <li ref={ref} className={cn('', className)} {...props} />
)
PaginationItem.displayName = 'PaginationItem'

/**
 * A numbered page link. Rendered as a button because every dashboard paginator
 * drives navigation imperatively via onClick rather than by URL.
 */
const PaginationLink = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<'button'> & { isActive?: boolean }
>(({ className, isActive, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    aria-current={isActive ? 'page' : undefined}
    className={cn(buttonVariants({ variant: isActive ? 'outline' : 'ghost', size: 'icon' }), className)}
    {...props}
  />
))
PaginationLink.displayName = 'PaginationLink'

const PaginationPrevious = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<'button'>
>(({ className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    aria-label="Aller à la page précédente"
    className={cn(buttonVariants({ variant: 'outline', size: 'default' }), 'gap-1 pl-2.5', className)}
    {...props}
  />
))
PaginationPrevious.displayName = 'PaginationPrevious'

const PaginationNext = React.forwardRef<HTMLButtonElement, React.ComponentProps<'button'>>(
  ({ className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label="Aller à la page suivante"
      className={cn(buttonVariants({ variant: 'outline', size: 'default' }), 'gap-1 pr-2.5', className)}
      {...props}
    />
  )
)
PaginationNext.displayName = 'PaginationNext'

const PaginationEllipsis = ({ className, ...props }: React.ComponentProps<'span'>) => (
  <span
    aria-hidden
    className={cn('flex h-9 w-9 items-center justify-center', className)}
    {...props}
  >
    <MoreHorizontal className="h-4 w-4" />
    <span className="sr-only">Plus de pages</span>
  </span>
)
PaginationEllipsis.displayName = 'PaginationEllipsis'

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationList,
  PaginationNext,
  PaginationPrevious,
}
