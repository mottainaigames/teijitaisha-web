import { useState, type ReactNode } from "react";

interface Props {
  title: string;
  defaultOpen?: boolean;
  badge?: string | number;
  children: ReactNode;
  className?: string;
}

export function CollapsibleSection({
  title,
  defaultOpen = false,
  badge,
  children,
  className = "",
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`collapsible ${open ? "collapsible--open" : ""} ${className}`.trim()}>
      <button
        type="button"
        className="collapsible__toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
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
