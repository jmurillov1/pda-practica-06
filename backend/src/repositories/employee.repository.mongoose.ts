import type { HydratedDocument } from 'mongoose';
import { EmployeeModel, type EmployeeAttributes } from '../models/employee.model.js';
import type { EmployeeRepository, Employee } from './employee.repository.js';

const toEmployee = (doc: HydratedDocument<EmployeeAttributes>): Employee => ({
  id: doc._id.toString(),
  nombre: doc.nombre,
  cargo: doc.cargo,
  departamento: doc.departamento,
  sueldo: doc.sueldo,
});

export class MongooseEmployeeRepository implements EmployeeRepository {
  async findAll(): Promise<Employee[]> {
    const employees = await EmployeeModel.find();
    return employees.map(toEmployee);
  }

  async findById(id: string): Promise<Employee | null> {
    const employee = await EmployeeModel.findById(id);
    return employee ? toEmployee(employee) : null;
  }

  async create(data: Omit<Employee, 'id'>): Promise<Employee> {
    const employee = new EmployeeModel(data);
    await employee.save();
    return toEmployee(employee);
  }

  async update(id: string, data: Partial<Omit<Employee, 'id'>>): Promise<Employee | null> {
    const employee = await EmployeeModel.findByIdAndUpdate(id, data, { returnDocument: 'after' });
    return employee ? toEmployee(employee) : null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await EmployeeModel.findByIdAndDelete(id);
    return !!deleted;
  }
}
