# Frameworks

The request pipeline (`EndpointController`) is framework-agnostic. Bindings only
translate the framework's request/response into the neutral contracts, so support for
a new framework is a small class.

> Fastify and Hono are **not dependencies**. Their instances are typed structurally, so
> nothing is imported at runtime and your bundle stays clean.

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
