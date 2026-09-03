# Frameworks

The request pipeline (`EndpointController`) is framework-agnostic. Bindings only
translate the framework's request/response into the neutral contracts, so support for
a new framework is a small class.

> Framework integrations are optional. Import the dedicated Nest entry point only in a
> Nest application; Fastify and Hono remain structurally typed with no runtime imports.

## Express

```ts
import express, { Router } from 'express';

const router = Router();
createAutoRead({ model: 'User', delegate: prisma.user, methods: ['GET', 'QUERY'] })
    .applyTo(router);
app.use('/users', router);
```

Routes are registered with `router.all` plus a method guard, which is what lets
non-standard methods such as `QUERY` be routed. JSON body parsing is added
automatically when a body-carrying method is enabled.

## NestJS

Register generated endpoints as a dynamic module:

```ts
import { Module } from '@nestjs/common';
import { AutoReadModule } from '@didactika/prisma-autoread/nest';
import { prisma } from './prisma';

@Module({
    imports: [
        AutoReadModule.register([
            {
                path: 'users',
                model: 'User',
                delegate: prisma.user,
                methods: ['GET'],
                routes: ['list', 'count'],
                legacy: false,
            },
            {
                path: 'orders',
                model: 'Order',
                delegate: prisma.order,
                methods: ['GET', 'POST'],
                legacy: false,
            },
        ]),
    ],
})
export class AppModule {}
```

`AutoReadModule` creates one decorated Nest controller per registration and one native
handler per route/method pair. Consequently the endpoints pass through Nest's normal
`RouterExplorer`, guards, interceptors and exception layer, and bootstrap logs contain
entries such as:

```
[Nest] 68  - 09/03/2026, 5:50:35 PM  LOG [RouterExplorer] Mapped {/users, GET} route +4ms
```

### Swagger / OpenAPI

No flag is required. At module registration time prisma-autoread checks whether
`@nestjs/swagger` can be resolved from the host application:

- when present, it adds a model tag, stable operation ids, operation summaries,
  deep-object filter metadata, the remaining query controls, JSON request bodies,
  generic success responses and all supported output content types;
- when absent, the same Nest routes work without loading or requiring Swagger.

Create the document after creating the Nest application in the usual way:

```ts
const app = await NestFactory.create(AppModule);
const config = new DocumentBuilder().setTitle('API').setVersion('1.0').build();
const document = SwaggerModule.createDocument(app, config);
SwaggerModule.setup('docs', app, document);
```

Because the generated operations are ordinary Nest controller metadata, they are
included in that document automatically. Nest 12 is required for the HTTP `QUERY`
method; `GET` and `POST` work on Nest 10–12.

## Fastify

```ts
import Fastify from 'fastify';

const fastify = Fastify();
fastify.addHttpMethod('QUERY', { hasBody: true });   // Fastify v5, only if you use QUERY

createAutoRead({ model: 'User', delegate: prisma.user, methods: ['GET', 'QUERY'] })
    .applyToFastify(fastify);

await fastify.listen({ port: 3000 });
```

Each route is registered via `fastify.route({ method, url, handler })`. Fastify parses
JSON bodies itself.

## Hono

```ts
import { Hono } from 'hono';

const app = new Hono();
createAutoRead({ model: 'User', delegate: prisma.user, methods: ['GET', 'QUERY'] })
    .applyToHono(app);

export default app;
```

Routes are registered with `app.on(methods, path, handler)`, which accepts any method.
Because Hono has no deep-object query parser, the binding expands bracket parameters
(`filter[age][gte]=30`) itself.

## Mounting

Bindings register the configured **route paths** (`/`, `/count`, …) relative to wherever
you mount them. Mount one endpoint per resource:

```
app.use('/users', …)      → GET /users, GET /users/count
app.use('/orders', …)     → GET /orders, GET /orders/count
```

## Custom framework

```ts
const controller = createAutoRead({ /* … */ }).createController();

const payload = await controller.handle(route, {
    method: 'GET',
    query: parsedQuery,        // deep-object form
    body: parsedBody,          // for QUERY / POST
    path: '/',                 // the matched route path
    baseUrl: 'https://host/users',
    headers: { accept: 'application/json' },
});

// payload → { status, body, contentType? }
```

`contentType` is set only for non-JSON formats (CSV); otherwise send `body` as JSON.
