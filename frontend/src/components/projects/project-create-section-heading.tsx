import type { ReactNode } from "react";

export function SectionHeading({
  number,
  title,
  children,
  muted = false,
}: {
  number: string;
  title: string;
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <span
        className={
          muted
            ? "flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground"
            : "flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary"
        }
      >
        {number}
      </span>
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}
