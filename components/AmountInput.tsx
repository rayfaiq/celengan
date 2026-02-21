'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { parseAmountInput } from '@/lib/calculations'

type Props = {
  value: number | null
  onChange: (value: number | null) => void
  placeholder?: string
  autoFocus?: boolean
}

export function AmountInput({ value, onChange, placeholder = '500.000 atau 500k atau 1.5jt', autoFocus }: Props) {
  const [display, setDisplay] = useState(
    value != null ? new Intl.NumberFormat('id-ID').format(value) : ''
  )

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    if (!/^[\d.,kjt]*$/i.test(raw)) return
    setDisplay(raw)
    onChange(parseAmountInput(raw))
  }

  function handleBlur() {
    const parsed = parseAmountInput(display)
    if (parsed != null) {
      setDisplay(new Intl.NumberFormat('id-ID').format(parsed))
    }
  }

  return (
    <Input
      type="text"
      inputMode="numeric"
      value={display}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      autoFocus={autoFocus}
    />
  )
}
