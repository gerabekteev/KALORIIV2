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
    default:
      'bg-gradient-to-b from-[#1a1a21] to-[#141419] border-white/[0.07] shadow-[0_12px_32px_-12px_rgba(0,0,0,0.6)]',
    elevated:
      'bg-gradient-to-b from-[#23232c] to-[#191920] border-white/[0.11] shadow-[0_16px_40px_-10px_rgba(0,0,0,0.7)]',
    glass: 'bg-[#191920]/80 backdrop-blur-xl border-white/10 shadow-xl',
    interactive:
      'bg-gradient-to-b from-[#1a1a21] to-[#141419] border-white/[0.07] hover:border-emerald-500/40 hover:from-[#1f1f27] hover:to-[#18181f] active:scale-[0.99] cursor-pointer shadow-[0_12px_32px_-12px_rgba(0,0,0,0.6)]',
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
