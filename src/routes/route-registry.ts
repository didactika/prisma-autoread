import { Route } from './route';
import { ListRoute } from './list.route';
import { CountRoute } from './count.route';
import { AggregateRoute } from './aggregate.route';
import { GroupByRoute } from './group-by.route';
import { NotImplementedError } from '../errors';
import type { RouteName } from '../types/options';

/** Maps route names to their implementations. */
export class RouteRegistry {
    private readonly routes = new Map<RouteName, Route>();

    constructor() {
        this.register(new ListRoute())
            .register(new CountRoute())
            .register(new AggregateRoute())
            .register(new GroupByRoute());
    }

    register(route: Route): this {
        this.routes.set(route.name, route);
        return this;
    }

    get(name: RouteName): Route {
        const route = this.routes.get(name);
        if (!route) throw new NotImplementedError(`route '${name}'`);
        return route;
    }
}
