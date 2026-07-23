# Use case diagram

UML notation: a system boundary, actors, use cases named as operations, and
`«include»` / `«extend»` relationships between them.

[![Use case diagram](https://www.plantuml.com/plantuml/proxy?cache=no&fmt=svg&src=https://raw.githubusercontent.com/didactika/prisma-autoread/main/docs/diagrams/puml/use-cases.puml)](./puml/use-cases.puml)

*Source: [`puml/use-cases.puml`](./puml/use-cases.puml) — see [rendering](./README.md#rendering).*

## Actors

| Actor | What they do |
|---|---|
| **API Consumer** | Asks the endpoint for records, counts and summaries. |
| **Backend Developer** | Exposes the resource and decides its policy. |
| **Operator** | Watches how the endpoint behaves in production. |

## Main use case — `searchRecords()`

| | |
|---|---|
| **Actor** | API Consumer |
| **Includes** | `filterRecords()` |
| **Precondition** | The resource is exposed and Prisma is generated. |
| **Trigger** | `GET /users?filter[age][gte]=30`, or the same question in RSQL, OData or a body. |
| **Main flow** | 1. The request arrives and is read in its protocol. 2. `filterRecords()` checks every field, operator and value against the resource. 3. The access policy is enforced. 4. The plan is built. 5. Records and total are fetched together. 6. The page is formatted with its navigation links. |
| **Alternate** | An identical question asked before reuses its remembered plan. |
| **Exceptions** | Unknown field → `400`; field outside the policy → `400`. |
| **Postcondition** | One page is returned. Nothing is ever modified. |
