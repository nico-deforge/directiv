import { useState } from "react";
import {
  Loader2,
  FileText,
  Package,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { usePluginSkills, usePluginSkillFile } from "../../hooks/useSkills";
import type { PluginSkillInfo } from "../../types";

export function SkillsSection() {
  const { data: skills, isLoading, error } = usePluginSkills();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/10 p-4">
        <p className="text-sm text-[var(--accent-red)]">
          Failed to load skills: {error.message}
        </p>
      </div>
    );
  }

  const pluginSkills = [...(skills ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">
          Directiv Skills
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Skills shipped with the Directiv plugin for Claude Code.
        </p>
      </div>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Package className="size-4 text-[var(--accent-blue)]" />
          <h2 className="text-sm font-medium text-[var(--text-secondary)]">
            Plugin Skills
          </h2>
          <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
            {pluginSkills.length}
          </span>
        </div>
        {pluginSkills.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            No plugin skills found.
          </p>
        ) : (
          <div className="space-y-2">
            {pluginSkills.map((skill) => (
              <SkillCard key={skill.name} skill={skill} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SkillCard({ skill }: { skill: PluginSkillInfo }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-secondary)]">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        {isExpanded ? (
          <ChevronDown className="size-4 shrink-0 text-[var(--text-muted)]" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-[var(--text-muted)]" />
        )}
        <div className="min-w-0 flex-1">
          <span className="font-medium text-[var(--text-primary)]">
            {skill.name}
          </span>
          {skill.description && (
            <p className="mt-0.5 truncate text-sm text-[var(--text-muted)]">
              {skill.description}
            </p>
          )}
        </div>
        <span className="shrink-0 text-xs text-[var(--text-muted)]">
          {skill.files.length} file{skill.files.length !== 1 ? "s" : ""}
        </span>
      </button>

      {isExpanded && (
        <div className="border-t border-[var(--border-default)]">
          <div className="flex">
            {/* File list */}
            <div className="w-48 shrink-0 border-r border-[var(--border-default)] py-2">
              {skill.files.map((file) => (
                <button
                  key={file}
                  onClick={() =>
                    setSelectedFile(selectedFile === file ? null : file)
                  }
                  className={`flex w-full items-center gap-2 px-4 py-1.5 text-left text-sm ${
                    selectedFile === file
                      ? "bg-[var(--bg-elevated)] text-[var(--text-primary)]"
                      : "text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <FileText className="size-3.5 shrink-0" />
                  <span className="truncate">{file}</span>
                </button>
              ))}
            </div>

            {/* File content */}
            <div className="flex-1 p-4">
              {selectedFile ? (
                <FileContent skillName={skill.name} filename={selectedFile} />
              ) : (
                <p className="text-sm text-[var(--text-muted)]">
                  Select a file to view its content
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FileContent({
  skillName,
  filename,
}: {
  skillName: string;
  filename: string;
}) {
  const {
    data: content,
    isLoading,
    error,
  } = usePluginSkillFile(skillName, filename);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
        <Loader2 className="size-4 animate-spin" />
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-[var(--accent-red)]">
        Failed to load file: {error.message}
      </p>
    );
  }

  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-[var(--bg-primary)] p-3 text-xs text-[var(--text-secondary)]">
      {content}
    </pre>
  );
}
