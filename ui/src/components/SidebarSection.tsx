import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface SidebarSectionProps {
  label: string;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}

export function SidebarSection({
  label,
  children,
  collapsible = false,
  defaultOpen = true,
}: SidebarSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (!collapsible) {
    return (
      <div>
        <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-widest font-mono text-muted-foreground/60">
          {label}
        </div>
        <div className="mt-0.5 flex flex-col gap-0.5">{children}</div>
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="group">
        <div className="flex items-center px-3 py-1.5">
          <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-1">
            <ChevronRight
              className={cn(
                "h-3 w-3 text-muted-foreground/60 transition-transform opacity-0 group-hover:opacity-100",
                open && "rotate-90",
              )}
            />
            <span className="text-[10px] font-medium uppercase tracking-widest font-mono text-muted-foreground/60">
              {label}
            </span>
          </CollapsibleTrigger>
        </div>
      </div>
      <CollapsibleContent>
        <div className="mt-0.5 flex flex-col gap-0.5">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
