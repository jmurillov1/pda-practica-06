import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createEmployeeController } from '../src/controllers/employee.controller.js';
import type { EmployeeRepository } from '../src/repositories/employee.repository.js';
import { InMemoryEmployeeRepository } from './helpers/employee.repository.in-memory.js';

const buildApp = () => {
  const repository = new InMemoryEmployeeRepository();
  const employeeController = createEmployeeController(repository);
  return createApp({ employeeController });
};

const validEmployee = {
  nombre: 'Andrés Mendoza',
  cargo: 'Arquitecto de Software',
  departamento: 'Innovación',
  sueldo: 4500,
};

describe('API de empleados', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    app = buildApp();
  });

  it('GET /api/v1/empleados devuelve una lista vacía inicialmente', async () => {
    const response = await request(app).get('/api/v1/empleados');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, data: [] });
  });

  it('POST /api/v1/empleados crea un empleado y devuelve 201 con Location', async () => {
    const response = await request(app).post('/api/v1/empleados').send(validEmployee);

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject(validEmployee);
    expect(response.headers.location).toMatch(/^\/api\/v1\/empleados\//);
  });

  it('POST /api/v1/empleados rechaza datos inválidos con 400 y detalle de errores', async () => {
    const response = await request(app)
      .post('/api/v1/empleados')
      .send({ nombre: 'An', cargo: 'Developer', departamento: 'TI', sueldo: -200 });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(Array.isArray(response.body.errors)).toBe(true);
    expect(response.body.errors.length).toBeGreaterThan(0);
    expect(response.body.errors[0]).toHaveProperty('field');
    expect(response.body.errors[0]).toHaveProperty('message');
  });

  it('POST /api/v1/empleados rechaza campos adicionales no declarados', async () => {
    const response = await request(app)
      .post('/api/v1/empleados')
      .send({ ...validEmployee, extra: 'no permitido' });

    expect(response.status).toBe(400);
  });

  it('GET /api/v1/empleados/:id devuelve 404 si no existe', async () => {
    const response = await request(app).get('/api/v1/empleados/000000000000000000000001');

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });

  it('GET /api/v1/empleados/:id devuelve 400 con un id malformado', async () => {
    const response = await request(app).get('/api/v1/empleados/no-es-un-id');

    expect(response.status).toBe(400);
  });

  it('PUT /api/v1/empleados/:id actualiza un empleado existente', async () => {
    const created = await request(app).post('/api/v1/empleados').send(validEmployee);
    const id = created.body.data.id as string;

    const response = await request(app).put(`/api/v1/empleados/${id}`).send({ sueldo: 5000 });

    expect(response.status).toBe(200);
    expect(response.body.data.sueldo).toBe(5000);
  });

  it('PUT /api/v1/empleados/:id rechaza un body vacío con 400', async () => {
    const created = await request(app).post('/api/v1/empleados').send(validEmployee);
    const id = created.body.data.id as string;

    const response = await request(app).put(`/api/v1/empleados/${id}`).send({});

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it('DELETE /api/v1/empleados/:id elimina un empleado existente', async () => {
    const created = await request(app).post('/api/v1/empleados').send(validEmployee);
    const id = created.body.data.id as string;

    const response = await request(app).delete(`/api/v1/empleados/${id}`);

    expect(response.status).toBe(204);
  });

  it('devuelve 404 con el wrapper para rutas inexistentes', async () => {
    const response = await request(app).get('/api/v1/ruta-inexistente');

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });

  it('GET /api/v1/health responde 200', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('un error no controlado del repositorio responde 500 con el Response Wrapper', async () => {
    const failingRepository: EmployeeRepository = {
      findAll: () => Promise.reject(new Error('fallo inesperado de infraestructura')),
      findById: () => Promise.resolve(null),
      create: () => Promise.reject(new Error('no usado en este test')),
      update: () => Promise.resolve(null),
      delete: () => Promise.resolve(false),
    };
    const failingApp = createApp({
      employeeController: createEmployeeController(failingRepository),
    });

    const response = await request(failingApp).get('/api/v1/empleados');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      data: null,
      message: 'Error interno del servidor',
      errors: [],
    });
  });
});
