import { MongooseEmployeeRepository } from './repositories/employee.repository.mongoose.js';
import {
  createEmployeeController,
  type EmployeeController,
} from './controllers/employee.controller.js';

export interface Dependencies {
  employeeController: EmployeeController;
}

export const createDependencies = (): Dependencies => {
  const employeeRepository = new MongooseEmployeeRepository();
  const employeeController = createEmployeeController(employeeRepository);
  return { employeeController };
};
