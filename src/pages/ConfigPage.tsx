import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Settings2,
  FolderGit2,
  KanbanSquare,
  Sparkles,
  Plug,
} from "lucide-react";
import { GeneralSection } from "../components/Config/GeneralSection";
import { WorkspacesSection } from "../components/Config/WorkspacesSection";
import { LinearSection } from "../components/Config/LinearSection";
import { SkillsSection } from "../components/Config/SkillsSection";
import { IntegrationsSection } from "../components/Config/IntegrationsSection";

const CONFIG_SECTIONS = {
  GENERAL: "general",
  WORKSPACES: "workspaces",
  LINEAR: "linear",
  SKILLS: "skills",
  INTEGRATIONS: "integrations",
} as const;

type ConfigSection = (typeof CONFIG_SECTIONS)[keyof typeof CONFIG_SECTIONS];

export function ConfigPage() {
  const [activeSection, setActiveSection] = useState<ConfigSection>(
    CONFIG_SECTIONS.GENERAL,
  );

  return (
    <div className="flex h-full bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Sidebar */}
      <aside className="flex w-[200px] shrink-0 flex-col border-r border-[var(--border-default)] bg-[var(--bg-secondary)]">
        <div className="shrink-0 border-b border-[var(--border-default)] px-4 py-3">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <ArrowLeft className="size-4" />
            <span>Back</span>
          </Link>
        </div>
        <nav className="flex-1 py-2">
          <MenuItem
            icon={<Settings2 className="size-4" />}
            label="General"
            active={activeSection === CONFIG_SECTIONS.GENERAL}
            onClick={() => setActiveSection(CONFIG_SECTIONS.GENERAL)}
          />
          <MenuItem
            icon={<FolderGit2 className="size-4" />}
            label="Workspaces"
            active={activeSection === CONFIG_SECTIONS.WORKSPACES}
            onClick={() => setActiveSection(CONFIG_SECTIONS.WORKSPACES)}
          />
          <MenuItem
            icon={<KanbanSquare className="size-4" />}
            label="Linear"
            active={activeSection === CONFIG_SECTIONS.LINEAR}
            onClick={() => setActiveSection(CONFIG_SECTIONS.LINEAR)}
          />
          <MenuItem
            icon={<Sparkles className="size-4" />}
            label="Skills"
            active={activeSection === CONFIG_SECTIONS.SKILLS}
            onClick={() => setActiveSection(CONFIG_SECTIONS.SKILLS)}
          />
          <MenuItem
            icon={<Plug className="size-4" />}
            label="Integrations"
            active={activeSection === CONFIG_SECTIONS.INTEGRATIONS}
            onClick={() => setActiveSection(CONFIG_SECTIONS.INTEGRATIONS)}
          />
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-6">
        {activeSection === CONFIG_SECTIONS.GENERAL && <GeneralSection />}
        {activeSection === CONFIG_SECTIONS.WORKSPACES && <WorkspacesSection />}
        {activeSection === CONFIG_SECTIONS.LINEAR && <LinearSection />}
        {activeSection === CONFIG_SECTIONS.SKILLS && <SkillsSection />}
        {activeSection === CONFIG_SECTIONS.INTEGRATIONS && (
          <IntegrationsSection />
        )}
      </main>
    </div>
  );
}

function MenuItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors ${
        active
          ? "bg-[var(--bg-elevated)] text-[var(--text-primary)]"
          : "text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
