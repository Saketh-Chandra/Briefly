import React, { useState, useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from './ui/input'

interface SearchBarProps {
  onSearch: (term: string) => void
  placeholder?: string
}

export default function SearchBar({
  onSearch,
  placeholder = 'Search recordings…'
}: SearchBarProps): React.JSX.Element {
  const [value, setValue] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => onSearch(value.trim()), 300)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [value, onSearch])

  return (
    <div className="relative">
      <Search
        size={14}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        className="pl-8 pr-8 bg-card/60 border-border/60 focus-visible:border-ring/60"
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {value && (
        <button
          onClick={() => setValue('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
