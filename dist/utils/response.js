export function successResponse(data, message, meta) {
    return {
        success: true,
        data,
        ...(message ? { message } : {}),
        ...(meta ? { meta } : {}),
    };
}
export function errorResponse(code, message, details) {
    return {
        success: false,
        error: {
            code,
            message,
            ...(details && details.length > 0 ? { details } : {}),
        },
    };
}
//# sourceMappingURL=response.js.map