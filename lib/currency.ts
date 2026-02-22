export function formatCurrency(amount: number, currency: 'IDR' | 'USD' = 'IDR'): string {
  if (currency === 'IDR') {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  } else {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  }
}

export function formatCurrencyCompact(amount: number, currency: 'IDR' | 'USD' = 'IDR'): string {
  const absAmount = Math.abs(amount)
  const isNegative = amount < 0

  let formatted: string
  if (absAmount >= 1_000_000_000) {
    formatted = (absAmount / 1_000_000_000).toFixed(1) + 'B'
  } else if (absAmount >= 1_000_000) {
    formatted = (absAmount / 1_000_000).toFixed(1) + 'M'
  } else if (absAmount >= 1_000) {
    formatted = (absAmount / 1_000).toFixed(1) + 'K'
  } else {
    formatted = absAmount.toFixed(0)
  }

  return (isNegative ? '-' : '') + (currency === 'IDR' ? 'Rp ' : '$') + formatted
}
