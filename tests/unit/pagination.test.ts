import { mockRequest, mockResponse, mockNext } from '../helpers/mock-request';
import PaginationMiddleware from '../../src/middlewares/pagination.middleware';

describe('PaginationMiddleware.processPagination', () => {
    const middleware = PaginationMiddleware.processPagination(10, 100);

    it('uses defaults when no pagination params are given', () => {
        const req = mockRequest({ query: {} });
        const res = mockResponse() as any;
        const next = mockNext();

        middleware(req, res, next);

        expect(req.custom?.pagination).toMatchObject({
            page: 1,
            limit: 10,
            skip: 0,
            sort: 'id',
            order: 'asc',
            take: 10,
            pageSize: 10,
        });
        expect(next).toHaveBeenCalled();
    });

    it('respects ?page=3&limit=20', () => {
        const req = mockRequest({ query: { page: '3', limit: '20' } });
        const res = mockResponse() as any;
        const next = mockNext();

        middleware(req, res, next);

        expect(req.custom?.pagination).toMatchObject({
            page: 3,
            limit: 20,
            skip: 40,
            take: 20,
        });
    });

    it('clamps limit to maxLimit', () => {
        const req = mockRequest({ query: { limit: '9999' } });
        const res = mockResponse() as any;
        const next = mockNext();

        middleware(req, res, next);

        expect(req.custom?.pagination?.limit).toBe(100);
    });

    it('clamps page to minimum 1', () => {
        const req = mockRequest({ query: { page: '-5' } });
        const res = mockResponse() as any;
        const next = mockNext();

        middleware(req, res, next);

        expect(req.custom?.pagination?.page).toBe(1);
    });

    it('respects ?sort=firstName&order=desc', () => {
        const req = mockRequest({ query: { sort: 'firstName', order: 'desc' } });
        const res = mockResponse() as any;
        const next = mockNext();

        middleware(req, res, next);

        expect(req.custom?.pagination?.sort).toBe('firstName');
        expect(req.custom?.pagination?.order).toBe('desc');
    });
});

describe('PaginationMiddleware.createPaginatedResponse', () => {
    const buildReq = (page = 1, limit = 10) =>
        mockRequest({
            query: { page: String(page), limit: String(limit) },
            custom: {
                pagination: {
                    page,
                    limit,
                    skip: (page - 1) * limit,
                    sort: 'id',
                    order: 'asc',
                    take: limit,
                    pageSize: limit,
                },
            },
            protocol: 'http',
            baseUrl: '/users',
            path: '/',
        });

    it('includes pagination metadata', () => {
        const req = buildReq(1, 10);
        const response = PaginationMiddleware.createPaginatedResponse(
            [{ id: 1 }],
            1,
            req
        );
        expect(response.pagination.total).toBe(1);
        expect(response.pagination.totalPages).toBe(1);
        expect(response.pagination.hasNext).toBe(false);
        expect(response.pagination.hasPrev).toBe(false);
    });

    it('includes next link when not on last page', () => {
        const req = buildReq(1, 5);
        const response = PaginationMiddleware.createPaginatedResponse(
            new Array(5).fill({ id: 1 }),
            25,
            req
        );
        expect(response.pagination.hasNext).toBe(true);
        expect(response._links.next).toBeDefined();
    });

    it('includes prev link when not on first page', () => {
        const req = buildReq(2, 5);
        const response = PaginationMiddleware.createPaginatedResponse(
            new Array(5).fill({ id: 1 }),
            25,
            req
        );
        expect(response.pagination.hasPrev).toBe(true);
        expect(response._links.prev).toBeDefined();
    });

    it('returns { data } when pagination is missing', () => {
        const req = mockRequest({ custom: {} });
        const response = PaginationMiddleware.createPaginatedResponse([{ id: 1 }], 1, req);
        expect(response).toEqual({ data: [{ id: 1 }] });
    });
});
