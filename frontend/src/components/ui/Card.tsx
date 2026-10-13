import React from 'react'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'glass' | 'interactive'
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  padding = 'md',
  className = '',
  ...props
}) => {
  const baseStyles = 'rounded-2xl transition-all duration-200 border'

  const variants = {
    default: 'bg-[#1c1c20] border-neutral-800/90 shadow-lg shadow-black/20',
    elevated: 'bg-[#242429] border-neutral-700/80 shadow-xl shadow-black/30',
    glass: 'bg-[#1c1c20]/80 backdrop-blur-md border-white/10 shadow-lg',
    interactive:
      'bg-[#1c1c20] border-neutral-800/90 hover:border-emerald-500/40 hover:bg-[#222226] active:scale-[0.99] cursor-pointer shadow-lg',
  }

  const paddings = {
    none: 'p-0',
    sm: 'p-3',
    md: 'p-4 sm:p-5',
    lg: 'p-6',
  }

  return (
    <div
      className={`${baseStyles} ${variants[variant]} ${paddings[padding]} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
