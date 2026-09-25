export interface Employee {
  id: string;
  nombre: string;
  cargo: string;
  departamento: string;
  sueldo: number;
}

export type CreateEmployee = Omit<Employee, 'id'>;

export type UpdateEmployee = Partial<CreateEmployee>;
