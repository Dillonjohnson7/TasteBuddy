import { cn } from "@/lib/utils/cn";
import { HTMLAttributes } from "react";

const CATEGORY_COLORS: Record<string, string> = {
  dairy: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  produce:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  meat: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  beverage:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  condiment:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  leftover:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  other: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  category?: string;
}

export function Badge({ category, className, children, ...props }: BadgeProps) {
  const colorClass = category
    ? CATEGORY_COLORS[category] ?? CATEGORY_COLORS.other
    : CATEGORY_COLORS.other;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        colorClass,
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
