"use client";

import { Input } from "@/components/ui/Input";
import { useEffect, useRef, useState } from "react";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  const [local, setLocal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  function handleChange(v: string) {
    setLocal(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(v), 250);
  }

  return (
    <Input
      type="search"
      placeholder="Search items..."
      value={local}
      onChange={(e) => handleChange(e.target.value)}
      className="max-w-xs"
    />
  );
}
