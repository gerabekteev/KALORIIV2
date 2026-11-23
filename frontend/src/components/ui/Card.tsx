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
  const baseStyles = 'rounded-[22px] transition-colors duration-150'

  const variants = {
    default: 'bg-[#1A1A1D]',
    elevated: 'bg-[#222226]',
    glass: 'bg-[#1A1A1D]/90 backdrop-blur-xl border border-white/[0.07]',
    interactive:
      'bg-[#1A1A1D] hover:bg-[#222226] active:scale-[0.99] cursor-pointer transition-all',
  }

  const paddings = {
    none: 'p-0',
    sm: 'p-3.5',
    md: 'p-4 sm:p-5',
    lg: 'p-5 sm:p-6',
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
