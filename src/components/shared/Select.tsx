import * as RadixSelect from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { forwardRef } from "react";

export const SelectRoot = RadixSelect.Root;
export const SelectGroup = RadixSelect.Group;
export const SelectValue = RadixSelect.Value;

export const SelectTrigger = forwardRef<
  React.ElementRef<typeof RadixSelect.Trigger>,
  React.ComponentPropsWithoutRef<typeof RadixSelect.Trigger>
>(({ className = "", children, ...props }, ref) => (
  <RadixSelect.Trigger
    ref={ref}
    className={`flex h-8 w-full items-center justify-between gap-2 rounded border border-[var(--border-default)] bg-[var(--bg-secondary)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors hover:bg-[var(--bg-tertiary)] focus:border-[var(--accent-blue)] focus:ring-1 focus:ring-[var(--accent-blue)] data-[placeholder]:text-[var(--text-muted)] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    {...props}
  >
    {children}
    <RadixSelect.Icon asChild>
      <ChevronDown className="size-3.5 text-[var(--text-muted)]" />
    </RadixSelect.Icon>
  </RadixSelect.Trigger>
));
SelectTrigger.displayName = "SelectTrigger";

export const SelectScrollUpButton = forwardRef<
  React.ElementRef<typeof RadixSelect.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof RadixSelect.ScrollUpButton>
>(({ className = "", ...props }, ref) => (
  <RadixSelect.ScrollUpButton
    ref={ref}
    className={`flex cursor-default items-center justify-center py-1 ${className}`}
    {...props}
  >
    <ChevronUp className="size-3.5 text-[var(--text-muted)]" />
  </RadixSelect.ScrollUpButton>
));
SelectScrollUpButton.displayName = "SelectScrollUpButton";

export const SelectScrollDownButton = forwardRef<
  React.ElementRef<typeof RadixSelect.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof RadixSelect.ScrollDownButton>
>(({ className = "", ...props }, ref) => (
  <RadixSelect.ScrollDownButton
    ref={ref}
    className={`flex cursor-default items-center justify-center py-1 ${className}`}
    {...props}
  >
    <ChevronDown className="size-3.5 text-[var(--text-muted)]" />
  </RadixSelect.ScrollDownButton>
));
SelectScrollDownButton.displayName = "SelectScrollDownButton";

export const SelectContent = forwardRef<
  React.ElementRef<typeof RadixSelect.Content>,
  React.ComponentPropsWithoutRef<typeof RadixSelect.Content>
>(({ className = "", children, position = "popper", ...props }, ref) => (
  <RadixSelect.Portal>
    <RadixSelect.Content
      ref={ref}
      className={`z-50 max-h-60 min-w-[8rem] overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-lg animate-in fade-in-0 zoom-in-95 ${position === "popper" ? "data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1" : ""} ${className}`}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <RadixSelect.Viewport
        className={`p-1 ${position === "popper" ? "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]" : ""}`}
      >
        {children}
      </RadixSelect.Viewport>
      <SelectScrollDownButton />
    </RadixSelect.Content>
  </RadixSelect.Portal>
));
SelectContent.displayName = "SelectContent";

export const SelectLabel = forwardRef<
  React.ElementRef<typeof RadixSelect.Label>,
  React.ComponentPropsWithoutRef<typeof RadixSelect.Label>
>(({ className = "", ...props }, ref) => (
  <RadixSelect.Label
    ref={ref}
    className={`px-2 py-1.5 text-xs font-medium text-[var(--text-muted)] ${className}`}
    {...props}
  />
));
SelectLabel.displayName = "SelectLabel";

export const SelectItem = forwardRef<
  React.ElementRef<typeof RadixSelect.Item>,
  React.ComponentPropsWithoutRef<typeof RadixSelect.Item>
>(({ className = "", children, ...props }, ref) => (
  <RadixSelect.Item
    ref={ref}
    className={`relative flex w-full cursor-pointer select-none items-center rounded py-1.5 pl-8 pr-2 text-sm text-[var(--text-primary)] outline-none transition-colors hover:bg-[var(--bg-tertiary)] focus:bg-[var(--bg-tertiary)] data-[disabled]:pointer-events-none data-[disabled]:opacity-50 ${className}`}
    {...props}
  >
    <span className="absolute left-2 flex size-3.5 items-center justify-center">
      <RadixSelect.ItemIndicator>
        <Check className="size-3.5" />
      </RadixSelect.ItemIndicator>
    </span>
    <RadixSelect.ItemText>{children}</RadixSelect.ItemText>
  </RadixSelect.Item>
));
SelectItem.displayName = "SelectItem";

export const SelectSeparator = forwardRef<
  React.ElementRef<typeof RadixSelect.Separator>,
  React.ComponentPropsWithoutRef<typeof RadixSelect.Separator>
>(({ className = "", ...props }, ref) => (
  <RadixSelect.Separator
    ref={ref}
    className={`-mx-1 my-1 h-px bg-[var(--border-default)] ${className}`}
    {...props}
  />
));
SelectSeparator.displayName = "SelectSeparator";
