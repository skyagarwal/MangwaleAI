import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Global exception filter - catches all unhandled errors
 * Prevents stack trace leaks to clients in production
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Don't handle WebSocket exceptions here
    if (host.getType() === 'ws') return;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let details: any = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const resp = exceptionResponse as any;
        message = resp.message || message;
        details = resp.error;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      
      // Log full stack trace for non-HTTP errors
      this.logger.error(
        `Unhandled exception: ${exception.message}`,
        exception.stack,
      );
    } else {
      this.logger.error(`Unknown exception type: ${JSON.stringify(exception)}`);
    }

    // Log the error with request context
    this.logger.error(
      `${request.method} ${request.url} → ${status} | ${message}`,
    );

    // Don't leak stack traces in production
    const isProduction = process.env.NODE_ENV === 'production';

    response.status(status).json({
      statusCode: status,
      message: Array.isArray(message) ? message : [message],
      error: details || HttpStatus[status],
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(isProduction ? {} : { stack: exception instanceof Error ? exception.stack : undefined }),
    });
  }
}
