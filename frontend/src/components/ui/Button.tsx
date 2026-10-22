import React from 'react'
import { Loader2 } from 'lucide-react'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg' | 'icon'
  isLoading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  className = '',
  disabled,
  ...props
}) => {
  const baseStyles =
    'relative inline-flex items-center justify-center font-medium transition-all duration-200 active:scale-[0.98] select-none rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 disabled:opacity-50 disabled:pointer-events-none cursor-pointer'

  const variants = {
    primary:
      'bg-gradient-to-b from-emerald-400 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 active:from-emerald-600 active:to-emerald-700 text-white shadow-[0_6px_20px_-4px_rgba(16,185,129,0.4)] border border-emerald-300/25',
    secondary:
      'bg-gradient-to-b from-[#272730] to-[#1e1e26] hover:from-[#30303b] hover:to-[#25252e] active:bg-[#1a1a21] text-neutral-100 border border-white/[0.09] shadow-sm',
    outline:
      'bg-emerald-500/[0.06] hover:bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 hover:border-emerald-400 active:bg-emerald-950/30',
    ghost:
      'bg-transparent hover:bg-white/[0.06] text-neutral-300 hover:text-white',
    danger:
      'bg-gradient-to-b from-red-500 to-red-600 hover:from-red-400 hover:to-red-600 active:bg-red-700 text-white shadow-[0_6px_20px_-4px_rgba(239,68,68,0.35)] border border-red-300/25',
  }

  const sizes = {
    sm: 'text-xs px-3 py-1.5 min-h-8 gap-1.5',
    md: 'text-sm px-4 py-2.5 min-h-11 gap-2',
    lg: 'text-base px-6 py-3.5 min-h-[52px] gap-2.5 font-semibold',
    icon: 'min-h-10 min-w-10 w-10 h-10 p-0 rounded-xl',
  }

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin text-current" />
      ) : (
        <>
          {leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>}
          {children}
          {rightIcon && <span className="inline-flex shrink-0">{rightIcon}</span>}
        </>
      )}
    </button>
  )
}
