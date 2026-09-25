import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import type { ApiResponse } from '../models/api-response.model';
import type { Employee } from '../models/employee.model';
import { EmployeeService } from './employee.service';

const API_URL = `${environment.apiUrl}/empleados`;

const employee = (overrides: Partial<Employee> = {}): Employee => ({
  id: '1',
  nombre: 'Andrés Mendoza',
  cargo: 'Arquitecto de Software',
  departamento: 'Innovación',
  sueldo: 4500,
  ...overrides,
});

const snapshot = (service: EmployeeService): Employee[] => {
  let value: Employee[] = [];
  service.employees$.subscribe((employees) => (value = employees));
  return value;
};

describe('EmployeeService', () => {
  let service: EmployeeService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(EmployeeService);

    httpMock.expectOne(API_URL).flush({
      success: true,
      data: [],
      message: 'Empleados obtenidos',
    } satisfies ApiResponse<Employee[]>);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('crea un empleado sin mutar el arreglo anterior (inmutabilidad)', () => {
    const previous = snapshot(service);

    service.create({ nombre: 'Ana Ruiz', cargo: 'QA', departamento: 'Calidad', sueldo: 3000 });

    const req = httpMock.expectOne(API_URL);
    expect(req.request.method).toBe('POST');
    req.flush({
      success: true,
      data: employee({ id: '2', nombre: 'Ana Ruiz' }),
      message: 'Empleado guardado',
    } satisfies ApiResponse<Employee>);

    const current = snapshot(service);
    expect(current).not.toBe(previous);
    expect(current).toHaveLength(1);
    expect(previous).toHaveLength(0);
  });

  it('elimina un empleado devolviendo un nuevo arreglo filtrado', () => {
    service.create(employee());
    httpMock.expectOne(API_URL).flush({
      success: true,
      data: employee(),
      message: 'Empleado guardado',
    } satisfies ApiResponse<Employee>);

    const beforeDelete = snapshot(service);
    service.remove('1');
    httpMock.expectOne(`${API_URL}/1`).flush(null);

    const afterDelete = snapshot(service);
    expect(afterDelete).not.toBe(beforeDelete);
    expect(afterDelete).toHaveLength(0);
  });
});
