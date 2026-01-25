/**
 * Simple path-based Router for V13 Admin Control Plane.
 */

import { IncomingMessage, ServerResponse } from 'http';

/**
 * Route handler function signature.
 */
export type RouteHandler = (
    req: IncomingMessage,
    res: ServerResponse,
    params: RouteParams
) => Promise<void>;

/**
 * Extracted route parameters.
 */
export interface RouteParams {
    /** Path parameters (e.g., :id) */
    params: Record<string, string>;
    /** Query string parameters */
    query: Record<string, string>;
}

/**
 * Internal route definition.
 */
interface RouteDefinition {
    method: string;
    pattern: RegExp;
    paramNames: string[];
    handler: RouteHandler;
}

/**
 * Simple path-based router.
 */
export class Router {
    private routes: RouteDefinition[] = [];
    private prefix: string;

    constructor(prefix: string = '') {
        this.prefix = prefix;
    }

    /**
     * Add a GET route.
     */
    get(path: string, handler: RouteHandler): this {
        return this.addRoute('GET', path, handler);
    }

    /**
     * Add a POST route.
     */
    post(path: string, handler: RouteHandler): this {
        return this.addRoute('POST', path, handler);
    }

    /**
     * Add a PUT route.
     */
    put(path: string, handler: RouteHandler): this {
        return this.addRoute('PUT', path, handler);
    }

    /**
     * Add a DELETE route.
     */
    delete(path: string, handler: RouteHandler): this {
        return this.addRoute('DELETE', path, handler);
    }

    /**
     * Add a route with any method.
     */
    private addRoute(method: string, path: string, handler: RouteHandler): this {
        const fullPath = this.prefix + path;
        const { pattern, paramNames } = this.pathToRegex(fullPath);

        this.routes.push({
            method,
            pattern,
            paramNames,
            handler,
        });

        return this;
    }

    /**
     * Convert a path pattern to a regex.
     * Supports :param syntax for path parameters.
     */
    private pathToRegex(path: string): { pattern: RegExp; paramNames: string[] } {
        const paramNames: string[] = [];

        // Escape special regex characters except for :param
        const regexStr = path
            .replace(/[-\/\\^$*+?.()|[\]{}]/g, (match) => {
                // Don't escape forward slashes and colons
                if (match === '/' || match === ':') {
                    return match;
                }
                return '\\' + match;
            })
            .replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
                paramNames.push(name);
                return '([^/]+)';
            });

        // Match exactly (no query string)
        const pattern = new RegExp(`^${regexStr}(?:\\?.*)?$`);

        return { pattern, paramNames };
    }

    /**
     * Parse query string from URL.
     */
    private parseQuery(url: string): Record<string, string> {
        const query: Record<string, string> = {};
        const questionIndex = url.indexOf('?');
        if (questionIndex === -1) {
            return query;
        }

        const queryString = url.slice(questionIndex + 1);
        const pairs = queryString.split('&');

        for (const pair of pairs) {
            const [key, value] = pair.split('=');
            if (key) {
                query[decodeURIComponent(key)] = value ? decodeURIComponent(value) : '';
            }
        }

        return query;
    }

    /**
     * Try to handle a request.
     * Returns true if a route matched and was handled.
     */
    async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
        const method = req.method ?? 'GET';
        const url = req.url ?? '/';

        for (const route of this.routes) {
            if (route.method !== method) {
                continue;
            }

            const match = url.match(route.pattern);
            if (!match) {
                continue;
            }

            // Extract path parameters
            const params: Record<string, string> = {};
            for (let i = 0; i < route.paramNames.length; i++) {
                params[route.paramNames[i]] = decodeURIComponent(match[i + 1]);
            }

            // Parse query string
            const query = this.parseQuery(url);

            // Call the handler
            await route.handler(req, res, { params, query });
            return true;
        }

        return false;
    }
}
