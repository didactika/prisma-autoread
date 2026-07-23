# Diagrams

All diagrams are **native PlantUML**. The `.puml` files under [`puml/`](./puml) are the
source of truth; each page embeds the rendered SVG.

| Diagram | Purpose | Source |
|---|---|---|
| [Context](./context.md) | Business-level state machine: what a search *is*, and the operations that move it forward. | [`context.puml`](./puml/context.puml) |
| [Use cases](./use-cases.md) | What each actor can ask of an endpoint, with `«include»` / `«extend»`. | [`use-cases.puml`](./puml/use-cases.puml) |
| [Domain model](./domain-model.md) | The concepts the engine manipulates, in business language. | [`domain-model.puml`](./puml/domain-model.puml) |
| [Containers](./containers.md) | Runtime building blocks and how a request flows through them. | [`containers.puml`](./puml/containers.puml) |
| [Components & deployment](./components.md) | Package structure, dependency rules and deployment topology. | [`components.puml`](./puml/components.puml) · [`deployment.puml`](./puml/deployment.puml) |
| [Classes](./classes.md) | Implementation classes, interfaces and their relationships. | [`classes.puml`](./puml/classes.puml) |
| [Sequences](./sequences.md) | Request flows: list, cached plan, `QUERY` body, aggregate, rejection. | [`sequence-*.puml`](./puml) |
| [State](./state.md) | Technical lifecycle of one request, including every exit. | [`state.puml`](./puml/state.puml) |

## Rendering

Pages embed the diagrams through the public PlantUML proxy, which fetches the `.puml`
from `main`:

```
https://www.plantuml.com/plantuml/proxy?cache=no&fmt=svg&src=https://raw.githubusercontent.com/didactika/prisma-autoread/main/docs/diagrams/puml/<name>.puml
```

Two consequences worth knowing:

- The images resolve only once the file is on **`main`** and the repository is
  **public**. On a feature branch they will not render until the branch is merged.
- Editing a `.puml` is enough — the image follows on the next page load, with no
  regeneration step.

### Previewing locally

| How | Command / action |
|---|---|
| VS Code | Install the *PlantUML* extension, open a `.puml`, `Alt+D`. |
| JetBrains | Install the *PlantUML Integration* plugin; the preview opens beside the file. |
| CLI | `npx plantuml docs/diagrams/puml/context.puml -tsvg` (needs Java). |
| Web | Paste the file into [the online server](https://www.plantuml.com/plantuml/uml/). |

## Conventions

- **States** are `UPPER_SNAKE_CASE`; transitions are the operations that cause them,
  written as `operationName()`.
- **Use cases** are named as operations too, so the state machine and the use case
  diagram share a vocabulary.
- The **domain model** uses business names only — no implementation types.
- The **class diagram** mirrors the code; type declarations live in `src/types/*.d.ts`
  and are deliberately left out.
