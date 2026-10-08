import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full min-w-0 rounded-lg border border-input bg-card px-3 py-1 text-sm text-foreground shadow-sm transition-colors file:mr-3 file:rounded-sm file:border-0 file:bg-secondary file:px-3 file:py-0.5 file:text-sm file:font-medium file:text-secondary-foreground file:transition-colors hover:file:bg-accent hover:file:text-accent-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
