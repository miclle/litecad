import { Separator as SeparatorPrimitive } from "@base-ui/react/separator"

import { cn } from "@/lib/utils"

function Separator({
  className,
  orientation = "horizontal",
  strength = "default",
  ...props
}: SeparatorPrimitive.Props & {
  strength?: "default" | "strong"
}) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      data-strength={strength}
      orientation={orientation}
      className={cn(
        "shrink-0",
        orientation === "horizontal" ? "h-px w-full" : "w-px self-stretch",
        strength === "strong" ? "bg-foreground/20" : "bg-border",
        className
      )}
      {...props}
    />
  )
}

export { Separator }
