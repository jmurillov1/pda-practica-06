import type { Employee, EmployeeRepository } from '../../src/repositories/employee.repository.js';

const generateId = (counter: number): string => counter.toString(16).padStart(24, '0');

export class InMemoryEmployeeRepository implements EmployeeRepository {
  private employees: Employee[] = [];
  private counter = 1;

  async findAll(): Promise<Employee[]> {
    return [...this.employees];
  }

  async findById(id: string): Promise<Employee | null> {
    return this.employees.find((employee) => employee.id === id) ?? null;
  }

  async create(data: Omit<Employee, 'id'>): Promise<Employee> {
    const created: Employee = { id: generateId(this.counter++), ...data };
    this.employees.push(created);
    return created;
  }

  async update(id: string, data: Partial<Omit<Employee, 'id'>>): Promise<Employee | null> {
    const index = this.employees.findIndex((employee) => employee.id === id);
    if (index === -1) return null;
    const current = this.employees[index] as Employee;
    const updated: Employee = { ...current, ...data };
    this.employees[index] = updated;
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const initialLength = this.employees.length;
    this.employees = this.employees.filter((employee) => employee.id !== id);
    return this.employees.length < initialLength;
  }
}
