import { useRef, type ButtonHTMLAttributes } from 'react';

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { label: string };

export function IconButton({
  label,
  className = 'icon-button',
  children,
  ...props
}: IconButtonProps) {
  const tooltipRef = useRef<HTMLSpanElement>(null);

  function showTooltip(button: HTMLButtonElement) {
    const tooltip = tooltipRef.current;
    if (!tooltip || button.disabled) return;
    tooltip.showPopover();
    const anchor = button.getBoundingClientRect();
    const bounds = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.max(8, Math.min(innerWidth - bounds.width - 8, anchor.left + anchor.width / 2 - bounds.width / 2))}px`;
    tooltip.style.top = `${anchor.bottom + bounds.height + 12 < innerHeight ? anchor.bottom + 8 : Math.max(8, anchor.top - bounds.height - 8)}px`;
  }

  return (
    <>
      <button
        {...props}
        type={props.type ?? 'button'}
        className={className}
        aria-label={label}
        onMouseEnter={(event) => {
          props.onMouseEnter?.(event);
          showTooltip(event.currentTarget);
        }}
        onMouseLeave={(event) => {
          props.onMouseLeave?.(event);
          if (document.activeElement !== event.currentTarget) tooltipRef.current?.hidePopover();
        }}
        onFocus={(event) => {
          props.onFocus?.(event);
          showTooltip(event.currentTarget);
        }}
        onBlur={(event) => {
          props.onBlur?.(event);
          tooltipRef.current?.hidePopover();
        }}
      >
        {children}
      </button>
      <span ref={tooltipRef} popover="manual" role="tooltip" className="control-tooltip">
        {label}
      </span>
    </>
  );
}
