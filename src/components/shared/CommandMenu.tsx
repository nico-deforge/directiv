import { Command as CmdkCommand } from "cmdk";
import { forwardRef } from "react";

export const CommandMenuRoot = forwardRef<
  React.ElementRef<typeof CmdkCommand>,
  React.ComponentPropsWithoutRef<typeof CmdkCommand>
>(({ className = "", ...props }, ref) => (
  <CmdkCommand
    ref={ref}
    className={`flex h-full w-full flex-col overflow-hidden rounded-lg bg-[var(--bg-secondary)] text-[var(--text-primary)] ${className}`}
    {...props}
  />
));
CommandMenuRoot.displayName = "CommandMenuRoot";

export const CommandMenuInput = forwardRef<
  React.ElementRef<typeof CmdkCommand.Input>,
  React.ComponentPropsWithoutRef<typeof CmdkCommand.Input>
>(({ className = "", ...props }, ref) => (
  <div className="flex items-center border-b border-[var(--border-default)] px-3">
    <CmdkCommand.Input
      ref={ref}
      className={`flex h-10 w-full bg-transparent py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  </div>
));
CommandMenuInput.displayName = "CommandMenuInput";

export const CommandMenuList = forwardRef<
  React.ElementRef<typeof CmdkCommand.List>,
  React.ComponentPropsWithoutRef<typeof CmdkCommand.List>
>(({ className = "", ...props }, ref) => (
  <CmdkCommand.List
    ref={ref}
    className={`max-h-[300px] overflow-y-auto overflow-x-hidden p-1 ${className}`}
    {...props}
  />
));
CommandMenuList.displayName = "CommandMenuList";

export const CommandMenuEmpty = forwardRef<
  React.ElementRef<typeof CmdkCommand.Empty>,
  React.ComponentPropsWithoutRef<typeof CmdkCommand.Empty>
>(({ className = "", ...props }, ref) => (
  <CmdkCommand.Empty
    ref={ref}
    className={`py-6 text-center text-sm text-[var(--text-muted)] ${className}`}
    {...props}
  />
));
CommandMenuEmpty.displayName = "CommandMenuEmpty";

export const CommandMenuGroup = forwardRef<
  React.ElementRef<typeof CmdkCommand.Group>,
  React.ComponentPropsWithoutRef<typeof CmdkCommand.Group>
>(({ className = "", ...props }, ref) => (
  <CmdkCommand.Group
    ref={ref}
    className={`overflow-hidden p-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-[var(--text-muted)] ${className}`}
    {...props}
  />
));
CommandMenuGroup.displayName = "CommandMenuGroup";

export const CommandMenuSeparator = forwardRef<
  React.ElementRef<typeof CmdkCommand.Separator>,
  React.ComponentPropsWithoutRef<typeof CmdkCommand.Separator>
>(({ className = "", ...props }, ref) => (
  <CmdkCommand.Separator
    ref={ref}
    className={`-mx-1 my-1 h-px bg-[var(--border-default)] ${className}`}
    {...props}
  />
));
CommandMenuSeparator.displayName = "CommandMenuSeparator";

export const CommandMenuItem = forwardRef<
  React.ElementRef<typeof CmdkCommand.Item>,
  React.ComponentPropsWithoutRef<typeof CmdkCommand.Item>
>(({ className = "", ...props }, ref) => (
  <CmdkCommand.Item
    ref={ref}
    className={`relative flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none transition-colors aria-selected:bg-[var(--bg-tertiary)] data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 ${className}`}
    {...props}
  />
));
CommandMenuItem.displayName = "CommandMenuItem";
