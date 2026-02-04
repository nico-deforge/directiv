import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Sparkles, Settings2, FolderGit2 } from "lucide-react";
import { SkillsSection } from "../components/Config/SkillsSection";

type ConfigSection = "skills" | "general" | "repositories";

export function ConfigPage() {
  const [activeSection, setActiveSection] = useState<ConfigSection>("skills");

  return (
    <div className="flex h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
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
            icon={<Sparkles className="size-4" />}
            label="Claude Skills"
            active={activeSection === "skills"}
            onClick={() => setActiveSection("skills")}
          />
          <MenuItem
            icon={<Settings2 className="size-4" />}
            label="General"
            active={activeSection === "general"}
            onClick={() => setActiveSection("general")}
          />
          <MenuItem
            icon={<FolderGit2 className="size-4" />}
            label="Repositories"
            active={activeSection === "repositories"}
            onClick={() => setActiveSection("repositories")}
          />
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-6">
        {activeSection === "skills" && <SkillsSection />}
        {activeSection === "general" && (
          <PlaceholderSection title="General Settings" />
        )}
        {activeSection === "repositories" && (
          <PlaceholderSection title="Repositories" />
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

function PlaceholderSection({ title }: { title: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-[var(--text-muted)]">{title} - Coming soon</p>
    </div>
  );
}
