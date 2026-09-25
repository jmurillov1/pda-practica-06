import type { Response } from 'express';

export const ok = (res: Response, data: unknown, message = 'Operación exitosa', status = 200) =>
  res.status(status).json({ success: true, data, message });

export const created = (res: Response, data: unknown, message: string, location: string) =>
  res.status(201).location(location).json({ success: true, data, message });

export const noContent = (res: Response) => res.status(204).send();

export const fail = (
  res: Response,
  message: string,
  errors: Array<{ field?: string; message: string }> = [],
  status = 400,
) => res.status(status).json({ success: false, data: null, message, errors });
