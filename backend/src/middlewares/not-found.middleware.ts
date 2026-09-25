import type { Request, Response } from 'express';

export const notFoundMiddleware = (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    data: null,
    message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
    errors: [],
  });
};
