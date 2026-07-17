import type { ComponentPropsWithoutRef, ReactNode } from "react";
import "../../styles/tokens.css";
import "./dropdown-menu.css";

type DropdownMenuProps = ComponentPropsWithoutRef<"div"> & {
  align?: "start" | "end";
  variant?: "black" | "white";
};

type DropdownMenuItemProps = ComponentPropsWithoutRef<"button"> & {
  icon?: ReactNode;
};

type DropdownMenuAccountProps = Omit<ComponentPropsWithoutRef<"div">, "children"> & {
  initial: string;
  label: string;
};

export function DropdownMenu({
  align = "end",
  children,
  className = "",
  role = "menu",
  variant = "white",
  ...menuProps
}: DropdownMenuProps) {
  return (
    <div
      className={`redesign-dropdown-menu redesign-dropdown-menu-${variant} redesign-dropdown-menu-${align} ${className}`.trim()}
      role={role}
      {...menuProps}
    >
      {children}
    </div>
  );
}

export function DropdownMenuAccount({
  className = "",
  initial,
  label,
  role = "presentation",
  ...accountProps
}: DropdownMenuAccountProps) {
  return (
    <div
      className={`redesign-dropdown-menu-account ${className}`.trim()}
      role={role}
      {...accountProps}
    >
      <span aria-hidden="true" className="redesign-dropdown-menu-account-avatar">
        {initial}
      </span>
      <strong>{label}</strong>
    </div>
  );
}

export function DropdownMenuItem({
  children,
  className = "",
  icon,
  role = "menuitem",
  type = "button",
  ...buttonProps
}: DropdownMenuItemProps) {
  return (
    <button
      className={`redesign-dropdown-menu-item ${className}`.trim()}
      role={role}
      type={type}
      {...buttonProps}
    >
      {icon ? (
        <span aria-hidden="true" className="redesign-dropdown-menu-item-icon">
          {icon}
        </span>
      ) : null}
      <span className="redesign-dropdown-menu-item-label">{children}</span>
    </button>
  );
}
