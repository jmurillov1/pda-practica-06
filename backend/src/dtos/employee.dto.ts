import { z } from 'zod';

export const createEmployeeSchema = z.strictObject({
  nombre: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  cargo: z.string().min(3, 'El cargo debe tener al menos 3 caracteres'),
  departamento: z.string().min(3, 'El departamento debe tener al menos 3 caracteres'),
  sueldo: z.number().positive('El sueldo debe ser un número positivo'),
});

export const updateEmployeeSchema = createEmployeeSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debe enviar al menos un campo para actualizar',
  });

export const idParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'El id no tiene un formato de ObjectId válido'),
});
