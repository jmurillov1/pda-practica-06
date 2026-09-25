import { Router } from 'express';
import type { EmployeeController } from '../controllers/employee.controller.js';
import { createEmployeeRouter } from './employee.routes.js';
import { getDatabaseStatus } from '../config/database.js';

export const createApiRouter = (employee: EmployeeController): Router => {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.status(200).json({
      success: true,
      data: { status: 'ok', database: getDatabaseStatus() },
      message: 'Servicio operativo',
    });
  });

  router.use(createEmployeeRouter(employee));

  return router;
};
