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
      'bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20 border border-emerald-400/20',
    secondary:
      'bg-[#26262a] hover:bg-[#323238] active:bg-[#1f1f23] text-neutral-100 border border-neutral-700/60 shadow-sm',
    outline:
      'bg-transparent hover:bg-neutral-800/60 text-emerald-400 border border-emerald-500/50 hover:border-emerald-500 active:bg-emerald-950/30',
    ghost:
      'bg-transparent hover:bg-neutral-800/60 text-neutral-300 hover:text-white',
    danger:
      'bg-red-500/90 hover:bg-red-600 active:bg-red-700 text-white shadow-lg shadow-red-500/20 border border-red-400/20',
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
