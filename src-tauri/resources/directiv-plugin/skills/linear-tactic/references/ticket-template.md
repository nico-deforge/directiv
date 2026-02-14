# Linear Ticket Template

Use this template when creating or updating a Linear issue description. Write all content in French.

```markdown
## Contexte

[Résumé concis du contexte métier et technique. Pourquoi cette tâche existe.]

## Objectif

[Ce que la tâche doit accomplir. Résultat attendu clair et mesurable.]

## Validation

[Critères d'acceptation. Liste des conditions pour considérer la tâche comme terminée.]
- [ ] Critère 1
- [ ] Critère 2

## Maquette

[Si une maquette Figma existe, inclure le lien Figma et une capture d'écran via l'outil get_screenshot.]

## Tactique

[Plan d'implémentation structuré, étape par étape. Chaque étape doit être actionnable.]

### Étape 1 : [Titre]
- Fichier(s) : `path/to/file.ts`
- Action : Créer/Modifier/Ajouter...
- Détails : ...

### Étape 2 : [Titre]
...

## Questions / Décisions

[Questions ouvertes, hypothèses formulées, décisions à prendre.]
- Question 1
- Hypothèse : ...
```

## Guidelines

- **Contexte**: 2-4 sentences max. Link to parent ticket if relevant.
- **Objectif**: Single clear outcome. Not a list of tasks.
- **Validation**: Testable criteria. Include edge cases.
- **Maquette**: Include only when a Figma link exists. Use Figma's `get_screenshot` tool to capture the relevant node, then attach the image to the Linear issue using `create_attachment`. Add the Figma link for reference. Omit this section entirely if no design exists.
- **Tactique**: The core deliverable. Each step must specify: file path, action, and implementation details. Use imperative French verbs.
- **Questions**: Only include if real blockers or assumptions exist. Do not add placeholder questions.
