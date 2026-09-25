import type { Request, RequestHandler, Response } from 'express';
import type { z } from 'zod';
import type { Employee, EmployeeRepository } from '../repositories/employee.repository.js';
import type { createEmployeeSchema, updateEmployeeSchema } from '../dtos/employee.dto.js';
import { ok, created, noContent } from '../utils/response.js';
import { AppError } from '../utils/errors.js';

type CreateEmployeeBody = z.infer<typeof createEmployeeSchema>;
type UpdateEmployeeBody = z.infer<typeof updateEmployeeSchema>;

export interface EmployeeController {
  list: RequestHandler;
  getById: RequestHandler<{ id: string }>;
  create: RequestHandler<object, unknown, CreateEmployeeBody>;
  update: RequestHandler<{ id: string }, unknown, UpdateEmployeeBody>;
  remove: RequestHandler<{ id: string }>;
}

export const createEmployeeController = (repo: EmployeeRepository): EmployeeController => ({
  list: async (_req: Request, res: Response) => {
    const employees = await repo.findAll();
    ok(res, employees, 'Empleados obtenidos');
  },

  getById: async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    const employee = await repo.findById(id);
    if (!employee) {
      throw new AppError(404, 'Empleado no encontrado');
    }
    ok(res, employee, 'Empleado obtenido');
  },

  create: async (req: Request<object, unknown, CreateEmployeeBody>, res: Response) => {
    const newEmployee = await repo.create(req.body);
    created(res, newEmployee, 'Empleado guardado', `/api/v1/empleados/${newEmployee.id}`);
  },

  update: async (req: Request<{ id: string }, unknown, UpdateEmployeeBody>, res: Response) => {
    const id = req.params.id;
    const updated = await repo.update(id, req.body as Partial<Omit<Employee, 'id'>>);
    if (!updated) {
      throw new AppError(404, 'Empleado no encontrado');
    }
    ok(res, updated, 'Empleado actualizado');
  },

  remove: async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    const deleted = await repo.delete(id);
    if (!deleted) {
      throw new AppError(404, 'Empleado no encontrado');
    }
    noContent(res);
  },
});
