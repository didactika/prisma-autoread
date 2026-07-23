# Context diagram

The endpoint and the searches it serves, as states connected by the operations that
move them forward. The internal, per-request view is the
[request lifecycle](./state.md).

[![State diagram](https://www.plantuml.com/plantuml/proxy?cache=no&fmt=svg&src=https://raw.githubusercontent.com/didactika/prisma-autoread/main/docs/diagrams/puml/context.puml)](./puml/context.puml)

*Source: [`puml/context.puml`](./puml/context.puml) — see [rendering](./README.md#rendering).*

## States

| State | Meaning |
|---|---|
| `ENDPOINT_UNDECLARED` | The resource is not exposed yet. |
| `ENDPOINT_READY` | The endpoint is mounted and waiting — the hub every search returns to. |
| `REQUEST_RECEIVED` | A client question has arrived. |
| `REQUEST_INTERPRETED` | The question has been read in one of the supported protocols. |
| `REQUEST_VALIDATED` | Fields, operators and values check out against the resource. |
| `REQUEST_AUTHORISED` | The question only touches what the access policy permits. |
| `PLAN_READY` | The question is one ready-to-run plan (fresh, remembered or reused). |
| `RESULT_READY` | The data store has answered. |
| `PAGE_READY` | The answer has been reduced to one page. |
| `ANSWER_FORMATTED` | The page is rendered in the requested format. |
| `REQUEST_REJECTED` | The question was refused before touching any data. |

## Operations

| Operation | Moves from → to |
|---|---|
| `declareEndpoint()` | `ENDPOINT_UNDECLARED` → `ENDPOINT_READY` |
| `receiveRequest()` | `ENDPOINT_READY` → `REQUEST_RECEIVED` |
| `interpretRequest()` | `REQUEST_RECEIVED` → `REQUEST_INTERPRETED` |
| `validateFields()` | `REQUEST_INTERPRETED` → `REQUEST_VALIDATED` |
| `enforcePolicy()` | `REQUEST_VALIDATED` → `REQUEST_AUTHORISED` |
| `buildPlan()` · `rememberPlan()` · `reusePlan()` | into and around `PLAN_READY` |
| `searchRecords()` · `countMatches()` · `summariseValues()` · `groupResults()` | `PLAN_READY` → `RESULT_READY` |
| `paginateResults()` | `RESULT_READY` → `PAGE_READY` |
| `chooseFormat()` | `PAGE_READY` → `ANSWER_FORMATTED` |
| `deliverAnswer()` | `ANSWER_FORMATTED` → `ENDPOINT_READY` |
| `rejectRequest()` · `denyAccess()` · `reportError()` | into and out of `REQUEST_REJECTED` |

> No transition reaches `RESULT_READY` without passing through `REQUEST_VALIDATED` and
> `REQUEST_AUTHORISED`: nothing is queried until it has been checked and authorised.

## Who takes part

| Actor / system | Part it plays |
|---|---|
| **Backend developer** | `declareEndpoint()` — exposes the resource and its policy. |
| **API consumer** | `receiveRequest()` … `deliverAnswer()` — asks and reads the page. |
| **HTTP framework** | Carries the request (Express · Fastify · Hono). |
| **Prisma** | Describes the resource and answers the plan. |
| **Data store** | Holds the records. |
