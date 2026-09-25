export class AppError extends Error {
  status: number;
  errors: Array<{ field?: string; message: string }>;

  constructor(
    status: number,
    message: string,
    errors: Array<{ field?: string; message: string }> = [],
  ) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}
