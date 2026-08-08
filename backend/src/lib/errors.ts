export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const conflict = (message: string): AppError =>
  new AppError(409, 'CONFLICT', message);

export const notFound = (resource: string): AppError =>
  new AppError(404, 'NOT_FOUND', `${resource} was not found`);
