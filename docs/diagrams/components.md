# Component & deployment diagrams

## Component diagram (packages and their dependencies)

[![Component diagram](https://www.plantuml.com/plantuml/proxy?cache=no&fmt=svg&src=https://raw.githubusercontent.com/didactika/prisma-autoread/main/docs/diagrams/puml/components.puml)](./puml/components.puml)

**Rules enforced by this shape**

- `core` never imports `http`, `input` or `output` — the query engine is transport-agnostic.
- Only `input/legacy.adapter` touches `legacy`, and only to drive it.
- `types` is a leaf: declaration files, imported with `import type`, erased at build time.

## Deployment diagram

[![Deployment diagram](https://www.plantuml.com/plantuml/proxy?cache=no&fmt=svg&src=https://raw.githubusercontent.com/didactika/prisma-autoread/main/docs/diagrams/puml/deployment.puml)](./puml/deployment.puml)

The library adds no process, port or network hop: it runs inside the API process and
its only outbound dependency is the Prisma Client already present in the application.

---

*Sources: [`puml/`](./puml/) — see [rendering](./README.md#rendering).*
