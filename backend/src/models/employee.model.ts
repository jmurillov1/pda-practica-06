import { Schema, model, type InferSchemaType } from 'mongoose';

const employeeSchema = new Schema(
  {
    nombre: { type: String, required: true },
    cargo: { type: String, required: true },
    departamento: { type: String, required: true },
    sueldo: { type: Number, required: true },
  },
  {
    // Se fija a mano: si se omite, Mongoose pluraliza el nombre del modelo
    // ('Employee') y la colección pasaría a llamarse 'employees' en inglés,
    // rompiendo la convención de que los datos van en español.
    collection: 'empleados',
    timestamps: true,
    versionKey: false,
  },
);

export type EmployeeAttributes = InferSchemaType<typeof employeeSchema>;

export const EmployeeModel = model<EmployeeAttributes>('Employee', employeeSchema);
