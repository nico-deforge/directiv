import * as RadixDropdownMenu from "@radix-ui/react-dropdown-menu";
import { forwardRef } from "react";

export const DropdownMenuRoot = RadixDropdownMenu.Root;
export const DropdownMenuTrigger = RadixDropdownMenu.Trigger;
export const DropdownMenuPortal = RadixDropdownMenu.Portal;
export const DropdownMenuGroup = RadixDropdownMenu.Group;
export const DropdownMenuSub = RadixDropdownMenu.Sub;
export const DropdownMenuRadioGroup = RadixDropdownMenu.RadioGroup;

export const DropdownMenuContent = forwardRef<
  React.ElementRef<typeof RadixDropdownMenu.Content>,
  React.ComponentPropsWithoutRef<typeof RadixDropdownMenu.Content>
>(({ className = "", ...props }, ref) => (
  <RadixDropdownMenu.Portal>
    <RadixDropdownMenu.Content
      ref={ref}
      sideOffset={4}
      className={`z-50 min-w-[8rem] overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] p-1 shadow-lg animate-in fade-in-0 zoom-in-95 ${className}`}
      {...props}
    />
  </RadixDropdownMenu.Portal>
));
DropdownMenuContent.displayName = "DropdownMenuContent";

export const DropdownMenuItem = forwardRef<
  React.ElementRef<typeof RadixDropdownMenu.Item>,
  React.ComponentPropsWithoutRef<typeof RadixDropdownMenu.Item> & {
    inset?: boolean;
  }
>(({ className = "", inset, ...props }, ref) => (
  <RadixDropdownMenu.Item
    ref={ref}
    className={`relative flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none transition-colors hover:bg-[var(--bg-tertiary)] focus:bg-[var(--bg-tertiary)] data-[disabled]:pointer-events-none data-[disabled]:opacity-50 ${inset ? "pl-8" : ""} ${className}`}
    {...props}
  />
));
DropdownMenuItem.displayName = "DropdownMenuItem";

export const DropdownMenuCheckboxItem = forwardRef<
  React.ElementRef<typeof RadixDropdownMenu.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof RadixDropdownMenu.CheckboxItem>
>(({ className = "", ...props }, ref) => (
  <RadixDropdownMenu.CheckboxItem
    ref={ref}
    className={`relative flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1.5 pl-8 text-sm text-[var(--text-primary)] outline-none transition-colors hover:bg-[var(--bg-tertiary)] focus:bg-[var(--bg-tertiary)] data-[disabled]:pointer-events-none data-[disabled]:opacity-50 ${className}`}
    {...props}
  />
));
DropdownMenuCheckboxItem.displayName = "DropdownMenuCheckboxItem";

export const DropdownMenuRadioItem = forwardRef<
  React.ElementRef<typeof RadixDropdownMenu.RadioItem>,
  React.ComponentPropsWithoutRef<typeof RadixDropdownMenu.RadioItem>
>(({ className = "", ...props }, ref) => (
  <RadixDropdownMenu.RadioItem
    ref={ref}
    className={`relative flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1.5 pl-8 text-sm text-[var(--text-primary)] outline-none transition-colors hover:bg-[var(--bg-tertiary)] focus:bg-[var(--bg-tertiary)] data-[disabled]:pointer-events-none data-[disabled]:opacity-50 ${className}`}
    {...props}
  />
));
DropdownMenuRadioItem.displayName = "DropdownMenuRadioItem";

export const DropdownMenuLabel = forwardRef<
  React.ElementRef<typeof RadixDropdownMenu.Label>,
  React.ComponentPropsWithoutRef<typeof RadixDropdownMenu.Label> & {
    inset?: boolean;
  }
>(({ className = "", inset, ...props }, ref) => (
  <RadixDropdownMenu.Label
    ref={ref}
    className={`px-2 py-1.5 text-xs font-medium text-[var(--text-muted)] ${inset ? "pl-8" : ""} ${className}`}
    {...props}
  />
));
DropdownMenuLabel.displayName = "DropdownMenuLabel";

export const DropdownMenuSeparator = forwardRef<
  React.ElementRef<typeof RadixDropdownMenu.Separator>,
  React.ComponentPropsWithoutRef<typeof RadixDropdownMenu.Separator>
>(({ className = "", ...props }, ref) => (
  <RadixDropdownMenu.Separator
    ref={ref}
    className={`-mx-1 my-1 h-px bg-[var(--border-default)] ${className}`}
    {...props}
  />
));
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";

export const DropdownMenuSubTrigger = forwardRef<
  React.ElementRef<typeof RadixDropdownMenu.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof RadixDropdownMenu.SubTrigger> & {
    inset?: boolean;
  }
>(({ className = "", inset, children, ...props }, ref) => (
  <RadixDropdownMenu.SubTrigger
    ref={ref}
    className={`flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none transition-colors hover:bg-[var(--bg-tertiary)] focus:bg-[var(--bg-tertiary)] data-[state=open]:bg-[var(--bg-tertiary)] ${inset ? "pl-8" : ""} ${className}`}
    {...props}
  >
    {children}
  </RadixDropdownMenu.SubTrigger>
));
DropdownMenuSubTrigger.displayName = "DropdownMenuSubTrigger";

export const DropdownMenuSubContent = forwardRef<
  React.ElementRef<typeof RadixDropdownMenu.SubContent>,
  React.ComponentPropsWithoutRef<typeof RadixDropdownMenu.SubContent>
>(({ className = "", ...props }, ref) => (
  <RadixDropdownMenu.SubContent
    ref={ref}
    className={`z-50 min-w-[8rem] overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] p-1 shadow-lg ${className}`}
    {...props}
  />
));
DropdownMenuSubContent.displayName = "DropdownMenuSubContent";
