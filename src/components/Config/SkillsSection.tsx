import { useState, useMemo } from "react";
import {
  Loader2,
  FileText,
  Package,
  ChevronRight,
  ChevronDown,
  Wand2,
} from "lucide-react";
import {
  usePluginSkills,
  useAllClaudeSkills,
  usePluginSkillFile,
} from "../../hooks/useSkills";
import { useSettingsStore } from "../../stores/settingsStore";
import { CLAUDE_MODELS } from "../../types";
import type {
  PluginSkillInfo,
  ClaudeSkillEntry,
  ClaudeModel,
} from "../../types";

const SKILL_ACTIONS = [
  {
    key: "code" as const,
    label: "Code",
    description: "Start button — launches a Claude session on a task",
    defaultSkill: "directiv:linear-code",
  },
  {
    key: "plan" as const,
    label: "Plan",
    description: "Planning action — generates a tactical plan",
    defaultSkill: "directiv:linear-plan",
  },
  {
    key: "fixCi" as const,
    label: "Fix CI",
    description: "CI fix action — diagnoses and fixes CI failures",
    defaultSkill: "directiv:fix-ci",
  },
] as const;

type SkillActionKey = (typeof SKILL_ACTIONS)[number]["key"];

const SOURCE_ORDER = ["directiv", "user", "plugin"] as const;
const SOURCE_LABELS: Record<string, string> = {
  directiv: "Directiv",
  user: "User Skills",
  plugin: "Plugins",
};

function groupSkillsBySource(skills: ClaudeSkillEntry[]) {
  const groups: Record<string, ClaudeSkillEntry[]> = {};
  for (const skill of skills) {
    // For plugin skills, group by plugin name
    const groupKey =
      skill.source === "plugin" && skill.pluginName
        ? `plugin:${skill.pluginName}`
        : skill.source;
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(skill);
  }

  // Sort groups: directiv first, then user, then plugins alphabetically
  const sortedKeys = Object.keys(groups).sort((a, b) => {
    const aOrder = SOURCE_ORDER.indexOf(a as (typeof SOURCE_ORDER)[number]);
    const bOrder = SOURCE_ORDER.indexOf(b as (typeof SOURCE_ORDER)[number]);
    const aIdx = aOrder >= 0 ? aOrder : 3;
    const bIdx = bOrder >= 0 ? bOrder : 3;
    if (aIdx !== bIdx) return aIdx - bIdx;
    return a.localeCompare(b);
  });

  return sortedKeys.map((key) => ({
    key,
    label: key.startsWith("plugin:")
      ? key.replace("plugin:", "")
      : (SOURCE_LABELS[key] ?? key),
    skills: groups[key],
  }));
}

export function SkillsSection() {
  const { data: pluginSkills, isLoading, error } = usePluginSkills();

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

  const sortedPluginSkills = (pluginSkills ?? []).toSorted((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <div className="max-w-lg space-y-8">
      {/* Skill Mapping */}
      <SkillMappingSection />

      {/* Bundled Plugin Skills (read-only viewer) */}
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
            {sortedPluginSkills.length}
          </span>
        </div>
        {sortedPluginSkills.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            No plugin skills found.
          </p>
        ) : (
          <div className="space-y-2">
            {sortedPluginSkills.map((skill) => (
              <SkillCard key={skill.name} skill={skill} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SkillMappingSection() {
  const config = useSettingsStore((s) => s.config);
  const setConfig = useSettingsStore((s) => s.setConfig);
  const { data: allSkills, isLoading, error } = useAllClaudeSkills();

  const grouped = useMemo(
    () => groupSkillsBySource(allSkills ?? []),
    [allSkills],
  );

  function handleSkillChange(actionKey: SkillActionKey, value: string) {
    setConfig({
      ...config,
      skills: {
        ...config.skills,
        [actionKey]: value || undefined,
      },
    });
  }

  function handleModelChange(actionKey: SkillActionKey, value: string) {
    setConfig({
      ...config,
      models: {
        ...config.models,
        [actionKey]: (value || undefined) as ClaudeModel | undefined,
      },
    });
  }

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">
          Skill Mapping
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Choose which skill and model to use for each action. Leave empty to
          use the defaults.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/10 p-4">
          <p className="text-sm text-[var(--accent-red)]">
            Failed to load available skills: {error.message}
          </p>
        </div>
      )}

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Wand2 className="size-4 text-[var(--accent-blue)]" />
          <h2 className="text-sm font-medium text-[var(--text-secondary)]">
            Actions
          </h2>
        </div>
        <div className="space-y-3">
          {SKILL_ACTIONS.map((action) => (
            <SkillMappingRow
              key={action.key}
              action={action}
              currentValue={config.skills?.[action.key] ?? ""}
              currentModel={config.models?.[action.key] ?? ""}
              grouped={grouped}
              allSkills={allSkills ?? []}
              isLoading={isLoading}
              onChange={(value) => handleSkillChange(action.key, value)}
              onModelChange={(value) => handleModelChange(action.key, value)}
            />
          ))}
        </div>
      </section>
    </>
  );
}

function SkillMappingRow({
  action,
  currentValue,
  currentModel,
  grouped,
  allSkills,
  isLoading,
  onChange,
  onModelChange,
}: {
  action: (typeof SKILL_ACTIONS)[number];
  currentValue: string;
  currentModel: string;
  grouped: ReturnType<typeof groupSkillsBySource>;
  allSkills: ClaudeSkillEntry[];
  isLoading: boolean;
  onChange: (value: string) => void;
  onModelChange: (value: string) => void;
}) {
  const isKnownSkill =
    !currentValue || allSkills.some((s) => s.id === currentValue);
  const [isCustomOverride, setIsCustomOverride] = useState(false);

  // Show custom input when user explicitly selected "Custom..." or when value
  // is unknown and skills have finished loading
  const showCustomInput =
    isCustomOverride || (!isLoading && !isKnownSkill && !!currentValue);
  const selectValue = showCustomInput ? "__custom__" : currentValue;

  function handleSelectChange(value: string) {
    if (value === "__custom__") {
      setIsCustomOverride(true);
    } else {
      setIsCustomOverride(false);
      onChange(value);
    }
  }

  return (
    <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-secondary)] px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between">
        <label className="text-sm font-medium text-[var(--text-primary)]">
          {action.label}
        </label>
        <span className="text-xs text-[var(--text-muted)]">
          {action.description}
        </span>
      </div>
      <div className="flex gap-2">
        <select
          value={selectValue}
          onChange={(e) => handleSelectChange(e.target.value)}
          disabled={isLoading}
          className="min-w-0 flex-1 rounded-md border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]"
        >
          <option value="">Default — {action.defaultSkill}</option>
          {grouped.map((group) => (
            <optgroup key={group.key} label={group.label}>
              {group.skills.map((skill) => (
                <option key={skill.id} value={skill.id}>
                  {skill.id}
                  {skill.description ? ` — ${skill.description}` : ""}
                </option>
              ))}
            </optgroup>
          ))}
          <option value="__custom__">Custom...</option>
        </select>
        <select
          value={currentModel}
          onChange={(e) => onModelChange(e.target.value)}
          className="w-36 rounded-md border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]"
        >
          <option value="">Default</option>
          <option value={CLAUDE_MODELS.OPUS}>Opus</option>
          <option value={CLAUDE_MODELS.SONNET}>Sonnet</option>
          <option value={CLAUDE_MODELS.HAIKU}>Haiku</option>
        </select>
      </div>
      {showCustomInput && (
        <input
          type="text"
          value={currentValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. my-plugin:my-skill"
          className="mt-2 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
        />
      )}
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
