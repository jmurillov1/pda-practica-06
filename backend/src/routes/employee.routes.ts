import { Router } from 'express';
import type { EmployeeController } from '../controllers/employee.controller.js';
import { createEmployeeSchema, updateEmployeeSchema, idParamSchema } from '../dtos/employee.dto.js';
import { validateBody, validateParams } from '../middlewares/validation.middleware.js';

export const createEmployeeRouter = (employee: EmployeeController): Router => {
  const router = Router();

  router.get('/empleados', employee.list);
  router.get('/empleados/:id', validateParams(idParamSchema), employee.getById);
  router.post('/empleados', validateBody(createEmployeeSchema), employee.create);
  router.put(
    '/empleados/:id',
    validateParams(idParamSchema),
    validateBody(updateEmployeeSchema),
    employee.update,
  );
  router.delete('/empleados/:id', validateParams(idParamSchema), employee.remove);

  return router;
};
