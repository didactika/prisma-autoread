import {
    Controller,
    HttpCode,
    HttpException,
    Module,
    RequestMapping,
    RequestMethod,
    Req,
    Res,
} from '@nestjs/common';
import { OptionsResolver } from '../config/options-resolver';
import { EndpointController } from './endpoint-controller';
import { NestRequestMapper } from './nest-request.mapper';
import { NestSwaggerDecorator } from './nest-swagger.decorator';
import type { ResolvedOptions, ResolvedRoute } from '../types/options';
import type {
    NestAutoReadRegistration,
    NestControllerClass,
    NestDynamicModule,
    NestRequestLike,
    NestResponseLike,
} from '../types/nest';

/** Creates native Nest controllers from prisma-autoread endpoint declarations. */
export class NestBinding {
    private readonly path: string;
    private readonly options: ResolvedOptions;
    private readonly controller: EndpointController;
    private readonly swagger = new NestSwaggerDecorator();

    constructor(registration: NestAutoReadRegistration) {
        const { path, ...endpoint } = registration;
        this.path = NestBinding.controllerPath(path);
        this.options = OptionsResolver.resolve(endpoint);
        this.controller = new EndpointController(this.options);
    }

    createController(): NestControllerClass {
        const endpoint = this.controller;
        const options = this.options;

        class GeneratedAutoReadController {}

        Object.defineProperty(GeneratedAutoReadController, 'name', {
            value: `${NestBinding.identifier(options.model)}AutoReadController`,
        });
        Controller(this.path)(GeneratedAutoReadController);

        for (const route of options.routes) {
            for (const method of options.methods) {
                const propertyKey = NestBinding.handlerName(route, method);
                const handler = async (request: NestRequestLike, response: NestResponseLike): Promise<unknown> => {
                    const mapped = NestRequestMapper.map({ request, response, endpoint: options, route });

                    try {
                        const payload = await endpoint.handle(route, mapped.context);
                        if (payload.contentType) NestBinding.setContentType(mapped.response, payload.contentType);
                        return payload.body;
                    } catch (error) {
                        NestBinding.rethrow(error);
                    }
                };

                Object.defineProperty(GeneratedAutoReadController.prototype, propertyKey, {
                    value: handler,
                    configurable: true,
                    writable: true,
                });

                const descriptor = Object.getOwnPropertyDescriptor(
                    GeneratedAutoReadController.prototype,
                    propertyKey,
                )!;
                RequestMapping({
                    path: NestBinding.routePath(route.path),
                    method: NestBinding.requestMethod(method),
                })(GeneratedAutoReadController.prototype, propertyKey, descriptor);
                HttpCode(200)(GeneratedAutoReadController.prototype, propertyKey, descriptor);
                Req()(GeneratedAutoReadController.prototype, propertyKey, 0);
                Res({ passthrough: true })(GeneratedAutoReadController.prototype, propertyKey, 1);
                this.swagger.decorateOperation(
                    GeneratedAutoReadController.prototype,
                    propertyKey,
                    descriptor,
                    route,
                    method,
                    options,
                );
            }
        }

        this.swagger.decorateController(GeneratedAutoReadController, options);
        return GeneratedAutoReadController;
    }

    private static requestMethod(method: string): RequestMethod {
        const requestMethod = (RequestMethod as unknown as Record<string, number>)[method.toUpperCase()];
        if (typeof requestMethod !== 'number') {
            throw new Error(
                `prisma-autoread/nest: HTTP method '${method}' is not supported by this Nest version`,
            );
        }
        return requestMethod as RequestMethod;
    }

    private static controllerPath(path: string): string {
        if (typeof path !== 'string') throw new Error('prisma-autoread/nest: `path` is required');
        return path.replace(/^\/+|\/+$/g, '');
    }

    private static routePath(path: string): string {
        return path === '/' ? '' : path.replace(/^\/+|\/+$/g, '');
    }

    private static handlerName(route: ResolvedRoute, method: string): string {
        return `${route.name}_${method.toLowerCase()}`;
    }

    private static identifier(value: string): string {
        return value.replace(/[^A-Za-z0-9_$]/g, '_');
    }

    private static setContentType(response: NestResponseLike, contentType: string): void {
        if (typeof response.type === 'function') response.type(contentType);
        else if (typeof response.header === 'function') response.header('content-type', contentType);
        else response.setHeader?.('content-type', contentType);
    }

    private static rethrow(error: unknown): never {
        if (error instanceof HttpException) throw error;

        const status = Number((error as { status?: unknown })?.status);
        if (Number.isInteger(status) && status >= 400 && status <= 599) {
            const message = error instanceof Error ? error.message : 'Request failed';
            throw new HttpException(message, status, { cause: error });
        }
        throw error;
    }
}

/** Dynamic Nest module that contributes generated controllers to the host application. */
export class AutoReadModule {
    static register(
        registration: NestAutoReadRegistration | NestAutoReadRegistration[],
    ): NestDynamicModule {
        const registrations = Array.isArray(registration) ? registration : [registration];
        return {
            module: AutoReadModule,
            controllers: registrations.map(item => new NestBinding(item).createController()),
        };
    }
}

Module({})(AutoReadModule);
