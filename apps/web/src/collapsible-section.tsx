import { useState, type ReactNode } from "react";

interface Props {
  title: string;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  badge?: string | number;
  children: ReactNode;
  className?: string;
}

export function CollapsibleSection({
  title,
  defaultOpen = false,
  open: openProp,
  onOpenChange,
  badge,
  children,
  className = "",
}: Props) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;

  const setOpen = (next: boolean) => {
    if (isControlled) onOpenChange?.(next);
    else setInternalOpen(next);
  };

  return (
    <div className={`collapsible ${open ? "collapsible--open" : ""} ${className}`.trim()}>
      <button
        type="button"
        className="collapsible__toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="collapsible__title">{title}</span>
        {badge !== undefined && badge !== "" && (
          <span className="collapsible__badge">{badge}</span>
        )}
        <span className="collapsible__chevron" aria-hidden>
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && <div className="collapsible__body">{children}</div>}
    </div>
  );
}
