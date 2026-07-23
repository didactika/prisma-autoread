# Domain model

The ideas the library works with, named in the language of the problem.

[![Domain model](https://www.plantuml.com/plantuml/proxy?cache=no&fmt=svg&src=https://raw.githubusercontent.com/didactika/prisma-autoread/main/docs/diagrams/puml/domain-model.puml)](./puml/domain-model.puml)

*Source: [`puml/domain-model.puml`](./puml/domain-model.puml) — see [rendering](./README.md#rendering).*

## Vocabulary

| Term | What it means |
|---|---|
| **Resource** | Something you expose to be searched — one model, one endpoint. |
| **Operation** | What can be asked of a resource: search, count, summary or grouping. |
| **Search request** | One question a client asks, in whichever protocol it prefers. |
| **Filter** | The narrowing part of a request; conditions joined with *and*, *or*, *not*. |
| **Condition** | A single comparison: a field, a comparison and a value. |
| **Relation** | A link to another resource a condition can reach through. |
| **Sorting** | The order the answer comes back in. |
| **Field selection** | Which fields, and which related data, the client wants back. |
| **Page** | How much is asked for and from where — by number or by cursor. |
| **Result page** | One page of the answer: records, total and navigation links. |
| **Record** | A single row of the answer. |
| **Summary** | Totals, averages, minimums and maximums, optionally grouped. |
| **Access policy** | What may be searched, what may be reached, and how deep. |
| **Parameter names** | The names the reserved parameters answer to, renameable per resource. |
