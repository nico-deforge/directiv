import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Settings, FolderKanban, RefreshCw, Search } from "lucide-react";
import {
  CommandMenuRoot,
  CommandMenuInput,
  CommandMenuList,
  CommandMenuEmpty,
  CommandMenuGroup,
  CommandMenuItem,
} from "../shared/CommandMenu";
import { useProjectStore } from "../../stores/projectStore";
import { useWorkflowStore } from "../../stores/workflowStore";

const COMMAND_CATEGORIES = {
  NAVIGATION: "navigation",
  ACTIONS: "actions",
  TASKS: "tasks",
} as const;

type CommandCategory =
  (typeof COMMAND_CATEGORIES)[keyof typeof COMMAND_CATEGORIES];

interface CommandEntry {
  id: string;
  label: string;
  category: CommandCategory;
  icon: React.ReactNode;
  action: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

function CommandPaletteDialog({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const projects = useProjectStore((s) => s.projects);
  const selectProject = useProjectStore((s) => s.selectProject);
  const tasks = useWorkflowStore((s) => s.tasks);
  const overlayRef = useRef<HTMLDivElement>(null);

  const staticCommands: CommandEntry[] = [
    {
      id: "nav-settings",
      label: "Go to Settings",
      category: COMMAND_CATEGORIES.NAVIGATION,
      icon: <Settings size={14} />,
      action: () => {
        navigate({ to: "/config" });
        onClose();
      },
    },
    {
      id: "nav-home",
      label: "Go to Home",
      category: COMMAND_CATEGORIES.NAVIGATION,
      icon: <FolderKanban size={14} />,
      action: () => {
        navigate({ to: "/" });
        onClose();
      },
    },
    {
      id: "action-refresh",
      label: "Refresh all",
      category: COMMAND_CATEGORIES.ACTIONS,
      icon: <RefreshCw size={14} />,
      action: () => {
        queryClient.invalidateQueries();
        onClose();
      },
    },
  ];

  const projectCommands: CommandEntry[] = projects.map((project) => ({
    id: `nav-project-${project.id}`,
    label: `Go to ${project.name}`,
    category: COMMAND_CATEGORIES.NAVIGATION,
    icon: <FolderKanban size={14} />,
    action: () => {
      selectProject(project.id);
      navigate({ to: "/" });
      onClose();
    },
  }));

  const taskCommands: CommandEntry[] = tasks.map((task) => ({
    id: `task-${task.id}`,
    label: task.title,
    category: COMMAND_CATEGORIES.TASKS,
    icon: <Search size={14} />,
    action: () => {
      // TODO: scroll to / focus the task node on the board
      onClose();
    },
  }));

  const allCommands = [...staticCommands, ...projectCommands, ...taskCommands];

  const navCommands = allCommands.filter(
    (c) => c.category === COMMAND_CATEGORIES.NAVIGATION,
  );
  const actionCommands = allCommands.filter(
    (c) => c.category === COMMAND_CATEGORIES.ACTIONS,
  );
  const taskCommandItems = allCommands.filter(
    (c) => c.category === COMMAND_CATEGORIES.TASKS,
  );

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === overlayRef.current) {
      onClose();
    }
  }

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[20vh]"
      onClick={handleOverlayClick}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-[var(--border-default)] shadow-2xl">
        <CommandMenuRoot>
          <CommandMenuInput placeholder="Search commands..." autoFocus />
          <CommandMenuList>
            <CommandMenuEmpty>No results found.</CommandMenuEmpty>

            {navCommands.length > 0 && (
              <CommandMenuGroup heading="Navigation">
                {navCommands.map((cmd) => (
                  <CommandMenuItem key={cmd.id} onSelect={cmd.action}>
                    <span className="text-[var(--text-muted)]">{cmd.icon}</span>
                    <span>{cmd.label}</span>
                  </CommandMenuItem>
                ))}
              </CommandMenuGroup>
            )}

            {actionCommands.length > 0 && (
              <CommandMenuGroup heading="Actions">
                {actionCommands.map((cmd) => (
                  <CommandMenuItem key={cmd.id} onSelect={cmd.action}>
                    <span className="text-[var(--text-muted)]">{cmd.icon}</span>
                    <span>{cmd.label}</span>
                  </CommandMenuItem>
                ))}
              </CommandMenuGroup>
            )}

            {taskCommandItems.length > 0 && (
              <CommandMenuGroup heading="Tasks">
                {taskCommandItems.map((cmd) => (
                  <CommandMenuItem key={cmd.id} onSelect={cmd.action}>
                    <span className="text-[var(--text-muted)]">{cmd.icon}</span>
                    <span>{cmd.label}</span>
                  </CommandMenuItem>
                ))}
              </CommandMenuGroup>
            )}
          </CommandMenuList>
        </CommandMenuRoot>
      </div>
    </div>
  );
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return <CommandPaletteDialog open={open} onClose={() => setOpen(false)} />;
}
