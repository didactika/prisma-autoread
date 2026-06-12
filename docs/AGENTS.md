# prisma-autoread — Agent Context

## ¿Qué es esta librería?

`prisma-autoread` es una librería npm (TypeScript) que genera automáticamente endpoints REST de lectura (`GET /`) para Express, integrándose con el esquema de Prisma. El consumidor sólo necesita proveer una función `findByFilter` que consulte la base de datos; la librería se encarga de parsear, validar y transformar los query params, paginar la respuesta en formato HAL, y manejar errores.

## Problema que resuelve

Repetir en cada microservicio la lógica de:
- Parsear `?age=30&active=true` y convertir los valores al tipo correcto (int, bool, string).
- Validar que los campos existan en el esquema Prisma.
- Soportar filtros por texto (`LIKE`, `STARTS_WITH`, etc.).
- Paginar resultados (`?page=1&limit=10`).
- Incluir relaciones anidadas (`?include=campus[*]`).
- Devolver respuestas HATEOAS (HAL) con links `self`, `next`, `prev`, `first`, `last`.

## Dependencias clave

| Paquete | Rol |
|---|---|
| `express ^4` | Framework HTTP (peer dependency) |
| `@prisma/client ^6` | DMMF para inspección del esquema en runtime (peer dependency) |
| `halson ^3` | Construcción de respuestas HAL |
| `http-response-client ^1` | Errores HTTP tipados (`BadRequest`, `NotFound`). Sus instancias exponen `err.status` |

## Arquitectura

```
src/
├── index.ts                        # Re-exports públicos
├── types/index.ts                  # Todos los tipos compartidos
├── utils/
│   └── url.utils.ts                # obtainUrl() — reconstruye la URL base
└── middlewares/
    ├── filter.middleware.ts        # Parsea y valida query params → req.custom
    ├── pagination.middleware.ts    # Lee page/limit/sort → req.custom.pagination + HAL
    ├── auto-read.middleware.ts     # Crea el GET / completo (orquesta los demás)
    └── utils/
        ├── filter-validator.util.ts        # Validación contra DMMF de Prisma
        ├── filter-value-parser.util.ts     # Coerción de tipos (string→int/bool)
        ├── include-parser.util.ts          # Parsea ?include= (*, array, bracket notation)
        └── nested-relation-processor.util.ts # Normaliza notación bracket a dot-notation
```

## Middlewares

### `FilterMiddleware.processQueryFilters(entityName?)`

Middleware Express que procesa los query params del request y popula `req.custom`:

- `req.custom.filter` — Filtros de igualdad (e.g. `{ age: 30, active: true }`)
- `req.custom.likeFilters` — Filtros de texto con modo (`LIKE`, `STARTS_WITH`, etc.)
- `req.custom.include` — Relaciones a incluir (parsea `?include=campus[*]`)
- `req.custom.search` — Término de búsqueda global (`?search=alice`)
- `req.custom.nestedSearch` — Búsquedas dentro de relaciones anidadas

Valida los nombres de campo contra `Prisma.dmmf` y lanza `BadRequest` si un campo no existe en el esquema.

### `PaginationMiddleware.processPagination(defaultLimit, maxLimit)`

Middleware Express que lee `?page=`, `?limit=`, `?sort=`, `?order=` y popula `req.custom.pagination`.

`PaginationMiddleware.createPaginatedResponse(data, totalCount, req, basePathPrefix?)` construye una respuesta HAL con:
```json
{
  "data": [...],
  "pagination": { "page": 1, "limit": 10, "total": 42, "totalPages": 5 },
  "_links": { "self": { "href": "..." }, "next": { "href": "..." }, ... }
}
```

### `AutoReadMiddleware.applyToRouter(router, config)`

El punto de entrada principal. Adjunta `PaginationMiddleware` + un handler `GET /` al router dado.

El handler:
1. Lee `req.custom` (populado previamente por `FilterMiddleware` y `PaginationMiddleware`)
2. Construye los filtros de igualdad (convirtiendo tipos vía DMMF, expandiendo dot-notation a objetos anidados)
3. Resuelve el `orderBy`: valida `?sort=` contra los campos del modelo (DMMF). Un `?sort=` explícito que no existe lanza `BadRequest` (`400`); el default `id` se omite silenciosamente si el modelo no lo tiene
4. Llama a `config.findByFilter({ where, include, orderBy, take, skip })`
5. Un resultado vacío devuelve `200` con `data: []` (no lanza error)
6. Limpia referencias circulares (y normaliza `Decimal`/`BigInt`) y devuelve la respuesta HAL paginada

## Interfaz `AutoReadConfig`

```typescript
interface AutoReadConfig {
    modelName: string;           // Nombre exacto del modelo Prisma (e.g. 'User')
    findByFilter: (
        query: PrismaQueryArgs   // { where, include, orderBy, take, skip }
    ) => Promise<{ data: any[]; total: number } | any[]>;
    searchableFields?: string[]; // Campos para ?search= global
    defaultLimit?: number;       // Default: 10
    maxLimit?: number;           // Default: 100
    basePathPrefix?: string;     // Para HATEOAS (e.g. '/api/v1')
}
```

## Uso típico

```typescript
import { Router } from 'express';
import { AutoReadMiddleware, FilterMiddleware } from 'prisma-autoread';

const router = Router();
router.use(FilterMiddleware.processQueryFilters('user'));

AutoReadMiddleware.applyToRouter(router, {
    modelName: 'User',
    findByFilter: async ({ where, include, orderBy, take, skip }) => {
        const [data, total] = await Promise.all([
            prisma.user.findMany({ where, include, orderBy, take, skip }),
            prisma.user.count({ where }),
        ]);
        return { data, total };
    },
    searchableFields: ['firstName', 'lastName', 'email'],
    basePathPrefix: '/api/v1',
});

app.use('/users', router);

// Error handler necesario para que NotFound/BadRequest lleguen al cliente
app.use((err: any, _req, res, _next) => {
    res.status(err.status ?? err.statusCode ?? 500).json({ error: err.message });
});
```

> **IMPORTANTE:** El error handler de Express **debe** usar `err.status` (no `err.statusCode`) porque `http-response-client` expone el código HTTP en la propiedad `status`.

## Query params soportados

| Param | Ejemplo | Descripción |
|---|---|---|
| Cualquier campo | `?age=30&active=true` | Filtro de igualdad; se convierte al tipo del campo en DMMF |
| `search` | `?search=alice` | Búsqueda full-text en `searchableFields` |
| `include` | `?include=campus[*]` | Incluir relaciones anidadas |
| `page` | `?page=2` | Número de página (1-based) |
| `limit` | `?limit=25` | Tamaño de página |
| `sort` | `?sort=lastName` | Campo de ordenación (validado contra DMMF; `400` si no existe) |
| `order` | `?order=desc` | Dirección de ordenación (`asc` / `desc`) |

## Tests

```
tests/
├── helpers/
│   ├── mock-dmmf.ts      # Mock de Prisma.dmmf con modelos User, Campus, UserEnrolment
│   └── mock-request.ts   # Factories: mockRequest(), mockResponse(), mockNext()
├── unit/                 # 73 tests — lógica de utilidades aislada
├── integration/          # 32 tests — middlewares con supertest + DMMF mockeado
└── e2e/                  # 13 tests contra SQLite real vía Prisma
```

Comandos:
```bash
npm run test:unit          # Solo tests unitarios
npm run test:integration   # Solo tests de integración
npm run test:e2e           # prisma generate + db push + tests E2E
npm run test:coverage      # Todos con cobertura
```

## Convenciones del proyecto

- Clases estáticas (`AutoReadMiddleware`, `FilterMiddleware`, etc.) — no se instancian.
- `req.custom` se inicializa con `??=` para evitar sobreescribir datos de middlewares previos.
- Los errores lanzados dentro de handlers async siempre se capturan con `try/catch` y se pasan a `next(err)` para que Express los enrute al error handler global.
- El DMMF de Prisma se accede en runtime vía `Prisma.dmmf.datamodel.models` — requiere que `@prisma/client` esté generado antes de ejecutar tests (`prisma generate`).
