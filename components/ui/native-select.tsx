import * as React from "react"

import { cn } from "@/lib/utils"

function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "border-input text-foreground h-10 w-full rounded-lg border bg-background/90 px-3 py-2 text-sm shadow-xs outline-none",
        "appearance-auto",
        "[color-scheme:light] dark:[color-scheme:dark]",
        "transition-[color,box-shadow,border-color,background-color]",
        "hover:border-border/90",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "dark:border-input dark:bg-input/40 dark:text-foreground",
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
}

export { NativeSelect }
