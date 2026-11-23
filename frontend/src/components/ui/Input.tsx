import React, { forwardRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, leftIcon, rightIcon, className = '', id, type, onWheel, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)
    const isPassword = type === 'password'
    const [showPassword, setShowPassword] = useState(false)

    const effectiveType = isPassword ? (showPassword ? 'text' : 'password') : type

    const handleWheel = (e: React.WheelEvent<HTMLInputElement>) => {
      if (type === 'number') {
        ;(e.target as HTMLElement).blur()
      }
      onWheel?.(e)
    }

    return (
      <div className="w-full text-left space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-medium text-[#A1A1AA]">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-3.5 flex items-center pointer-events-none text-[#7A7A82]">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            type={effectiveType}
            onWheel={handleWheel}
            style={{ touchAction: 'auto', WebkitUserSelect: 'text', userSelect: 'text' }}
            className={`w-full min-h-[44px] bg-[#111113] border text-white placeholder-[#6E6E75] rounded-2xl px-3.5 py-2.5 text-sm transition-colors outline-none focus:ring-2 focus:ring-white/15 focus:border-white/40 disabled:opacity-45 disabled:bg-[#0C0C0E] ${
              leftIcon ? 'pl-10' : ''
            } ${rightIcon || isPassword ? 'pr-10' : ''} ${
              error
                ? 'border-[#E02424] focus:border-[#E02424] focus:ring-[#E02424]/25'
                : 'border-white/[0.08] hover:border-white/[0.16]'
            } ${className}`}
            {...props}
          />
          {isPassword && !rightIcon ? (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 flex items-center text-[#7A7A82] hover:text-white transition-colors cursor-pointer focus:outline-none p-1"
              tabIndex={-1}
              aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          ) : rightIcon ? (
            <div className="absolute right-3.5 flex items-center text-[#7A7A82]">
              {rightIcon}
            </div>
          ) : null}
        </div>
        {error ? (
          <p className="text-xs text-[#E02424] font-medium pl-0.5">{error}</p>
        ) : helperText ? (
          <p className="text-xs text-[#7A7A82] pl-0.5">{helperText}</p>
        ) : null}
      </div>
    )
  }
)

Input.displayName = 'Input'
