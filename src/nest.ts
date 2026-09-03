/** Optional NestJS integration. Import from `@didactika/prisma-autoread/nest`. */
export { AutoReadModule, NestBinding } from './http/nest.binding';
export { NestRequestMapper } from './http/nest-request.mapper';
export type {
    NestAutoReadRegistration,
    NestControllerClass,
    NestDynamicModule,
} from './types/nest';
