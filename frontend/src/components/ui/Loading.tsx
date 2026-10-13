import React from 'react'
import { Loader2 } from 'lucide-react'

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
  label?: string
}

export const Spinner: React.FC<SpinnerProps> = ({
  size = 'md',
  className = '',
  label,
}) => {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-7 h-7',
    lg: 'w-10 h-10',
  }

  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
      <Loader2 className={`${sizes[size]} animate-spin text-emerald-500`} />
      {label && <span className="text-xs text-neutral-400 font-medium">{label}</span>}
    </div>
  )
}

export interface SkeletonProps {
  className?: string
  variant?: 'rectangular' | 'circular' | 'text'
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'rectangular',
}) => {
  const variantStyles = {
    rectangular: 'rounded-xl',
    circular: 'rounded-full',
    text: 'rounded-md h-4',
  }

  return (
    <div
      className={`animate-pulse bg-neutral-800/70 ${variantStyles[variant]} ${className}`}
    />
  )
}

export const PageLoading: React.FC<{ message?: string }> = ({
  message = 'Загрузка...',
}) => {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center p-8">
      <Spinner size="lg" label={message} />
    </div>
  )
}
