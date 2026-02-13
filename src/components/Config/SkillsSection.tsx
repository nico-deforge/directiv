import { Loader2, FileText, Package } from "lucide-react";
import { useBundledSkills } from "../../hooks/useSkills";

export function SkillsSection() {
  const { data: skills, isLoading, error } = useBundledSkills();

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

  const bundledSkills = skills ?? [];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">
          Claude Skills
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Bundled skills shipped with Directiv.
        </p>
      </div>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Package className="size-4 text-[var(--accent-blue)]" />
          <h2 className="text-sm font-medium text-[var(--text-secondary)]">
            Bundled Skills
          </h2>
          <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
            {bundledSkills.length}
          </span>
        </div>
        {bundledSkills.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            No bundled skills found.
          </p>
        ) : (
          <div className="space-y-2">
            {bundledSkills.map((skill) => (
              <div
                key={skill.name}
                className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-secondary)] px-4 py-3"
              >
                <div className="flex items-center gap-3">
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
                  <div className="flex items-center gap-1 shrink-0 text-xs text-[var(--text-muted)]">
                    <FileText className="size-3.5" />
                    {skill.files.length} file
                    {skill.files.length !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
