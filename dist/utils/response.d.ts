export interface ApiSuccessResponse<T = any> {
    success: true;
    data: T;
    message?: string;
    meta?: {
        page?: number;
        limit?: number;
        total?: number;
        totalPages?: number;
    };
}
export interface ApiErrorResponse {
    success: false;
    error: {
        code: string;
        message: string;
        details?: any[];
    };
}
export declare function successResponse<T>(data: T, message?: string, meta?: ApiSuccessResponse['meta']): ApiSuccessResponse<T>;
export declare function errorResponse(code: string, message: string, details?: any[]): ApiErrorResponse;
