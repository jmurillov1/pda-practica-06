import type { Request, Response, NextFunction } from 'express';
import type { ZodType } from 'zod';

const validate =
  (schema: ZodType, source: 'body' | 'params') =>
  (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(result.error);
    }
    if (source === 'body') {
      req.body = result.data;
    }
    next();
  };

export const validateBody = (schema: ZodType) => validate(schema, 'body');
export const validateParams = (schema: ZodType) => validate(schema, 'params');
