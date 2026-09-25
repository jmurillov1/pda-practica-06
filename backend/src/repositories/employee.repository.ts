export interface Employee {
  id: string;
  nombre: string;
  cargo: string;
  departamento: string;
  sueldo: number;
}

export interface EmployeeRepository {
  findAll(): Promise<Employee[]>;
  findById(id: string): Promise<Employee | null>;
  create(data: Omit<Employee, 'id'>): Promise<Employee>;
  update(id: string, data: Partial<Omit<Employee, 'id'>>): Promise<Employee | null>;
  delete(id: string): Promise<boolean>;
}
