import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';
import { fail } from '../utils/response.js';

export const errorMiddleware = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  if (err instanceof ZodError) {
    const errors = err.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    return fail(res, 'Datos inválidos', errors, 400);
  }

  if (err instanceof AppError) {
    return fail(res, err.message, err.errors, err.status);
  }

  console.error('Error no controlado:', err);
  return fail(res, 'Error interno del servidor', [], 500);
};
