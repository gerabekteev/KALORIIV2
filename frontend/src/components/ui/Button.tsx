import React from 'react'
import { Loader2 } from 'lucide-react'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'signal'
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
    'relative inline-flex items-center justify-center font-semibold transition-all duration-150 active:scale-[0.97] select-none rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-40 disabled:pointer-events-none cursor-pointer'

  const variants = {
    primary:
      'bg-white hover:bg-neutral-200 active:bg-neutral-300 text-black',
    secondary:
      'bg-[#2A2A2F] hover:bg-[#34343B] active:bg-[#232328] text-white',
    outline:
      'bg-transparent hover:bg-white/[0.06] text-white border border-white/15 hover:border-white/35',
    ghost:
      'bg-transparent hover:bg-white/[0.06] text-[#A1A1AA] hover:text-white',
    danger:
      'bg-[#E02424] hover:bg-[#C81E1E] active:bg-[#B91C1C] text-white',
    signal:
      'bg-[#E02424] hover:bg-[#C81E1E] active:bg-[#B91C1C] text-white',
  }

  const sizes = {
    sm: 'text-xs px-3.5 py-2 min-h-9 gap-1.5',
    md: 'text-sm px-4 py-2.5 min-h-[44px] gap-2',
    lg: 'text-sm px-6 py-3.5 min-h-[50px] gap-2 font-semibold',
    icon: 'min-h-[44px] min-w-[44px] w-11 h-11 p-0 rounded-full',
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
