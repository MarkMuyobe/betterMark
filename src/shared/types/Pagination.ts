/**
 * Pagination types and helpers for V13 Admin Control Plane.
 */

/**
 * Pagination query parameters from request.
 */
export interface PaginationQuery {
    page?: number;
    pageSize?: number;
}

/**
 * Pagination metadata for response.
 */
export interface PaginationMeta {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
}

/**
 * Paginated response wrapper.
 */
export interface PaginatedResponse<T> {
    data: T[];
    pagination: PaginationMeta;
}

/**
 * Default pagination settings.
 * V14: Changed DEFAULT_PAGE_SIZE from 20 to 25.
 */
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

/**
 * Parse pagination query parameters.
 */
export function parsePaginationQuery(query: Record<string, string | undefined>): PaginationQuery {
    const page = query.page ? parseInt(query.page, 10) : 1;
    const pageSize = query.pageSize ? parseInt(query.pageSize, 10) : DEFAULT_PAGE_SIZE;

    return {
        page: isNaN(page) || page < 1 ? 1 : page,
        pageSize: isNaN(pageSize) || pageSize < 1 ? DEFAULT_PAGE_SIZE : Math.min(pageSize, MAX_PAGE_SIZE),
    };
}

/**
 * Paginate an array of items.
 */
export function paginate<T>(items: T[], query: PaginationQuery): PaginatedResponse<T> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const total = items.length;
    const totalPages = Math.ceil(total / pageSize);

    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const data = items.slice(startIndex, endIndex);

    return {
        data,
        pagination: {
            page,
            pageSize,
            total,
            totalPages,
        },
    };
}

/**
 * Parse query string from URL.
 */
export function parseQueryString(url: string): Record<string, string> {
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
