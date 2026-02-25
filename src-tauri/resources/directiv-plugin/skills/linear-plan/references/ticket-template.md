# Linear Ticket Template

Use this template when creating or updating a Linear issue description. Write all content in French.

```markdown
## 💬 Contexte

[Résumé concis du contexte métier et technique. Pourquoi cette tâche existe.]

## 🎯 Objectif

[Ce que la tâche doit accomplir. Résultat attendu clair et mesurable.]

## ✅ Validation

[Critères d'acceptation. Liste des conditions pour considérer la tâche comme terminée.]
- [ ] Critère 1
- [ ] Critère 2

## 🛠️ Tactique

### Stratégie

[2-4 phrases décrivant l'approche globale : quel pattern suivre, quel flux de données, quelle architecture. C'est la vision d'ensemble, pas les détails.]

### Entrypoints

- **[Action verbe impératif]** — `path/to/file.ext` → one-liner décrivant le quoi
- **[Action verbe impératif]** — `path/to/file.ext` → one-liner décrivant le quoi
- ...

## ❓ Questions / Décisions

[Questions ouvertes, hypothèses formulées, décisions à prendre.]
- Question 1
- Hypothèse : ...
```

## Guidelines

- **Contexte**: 2-4 sentences max. Link to parent ticket if relevant.
- **Objectif**: Single clear outcome. Not a list of tasks.
- **Validation**: Testable criteria. Include edge cases.
- **Tactique**: Two parts. (1) **Stratégie** — 2-4 sentences describing the global approach, the pattern to follow, the data flow. No file paths here. (2) **Entrypoints** — flat bullet list, one bullet per touchpoint. Format: `**[Verb]** — \`path\` → what (max 15 words)`. No implementation details, no field types, no validation rules. The tactic is a map, not a manual.
- **Questions**: Only include if real blockers or assumptions exist. Do not add placeholder questions.
