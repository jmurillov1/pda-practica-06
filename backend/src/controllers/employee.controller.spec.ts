import { jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { createEmployeeController } from './employee.controller.js';
import type { Employee, EmployeeRepository } from '../repositories/employee.repository.js';
import { AppError } from '../utils/errors.js';

// Prueba unitaria de caja blanca (Reto: Modularidad y Capacidad de Prueba).
// El controlador se aísla por completo de Mongoose: el repositorio se mockea
// a partir de la interfaz `EmployeeRepository`, así que este archivo NO importa
// `mongoose` ni levanta base de datos alguna (Inversión de Dependencias).
describe('🧪 Unit Test: EmployeeController (Mantenibilidad & Testabilidad)', () => {
  let mockRepository: jest.Mocked<EmployeeRepository>;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;
  let locationMock: jest.Mock;
  let sendMock: jest.Mock;

  beforeEach(() => {
    // 1. Crear un mock 100% aislado de la interfaz (cero dependencia de Mongoose)
    mockRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    // 2. Mockear los objetos del ciclo de vida de Express
    jsonMock = jest.fn();
    sendMock = jest.fn();
    locationMock = jest.fn().mockReturnValue({ json: jsonMock });
    statusMock = jest.fn().mockReturnValue({ json: jsonMock, location: locationMock, send: sendMock });
    mockResponse = { status: statusMock, location: locationMock };
  });

  it('Debería retornar un estado 200 y la lista de empleados de la abstracción', async () => {
    const controller = createEmployeeController(mockRepository);
    const fakeEmployees: Employee[] = [
      {
        id: '507f1f77bcf86cd799439011',
        nombre: 'Andrés Mendoza',
        cargo: 'Arquitecto',
        departamento: 'TI',
        sueldo: 4000,
      },
    ];

    // Configurar el comportamiento esperado de la abstracción
    mockRepository.findAll.mockResolvedValue(fakeEmployees);
    mockRequest = {};

    await controller.list(mockRequest as Request, mockResponse as Response, jest.fn());

    // Verificaciones asertivas del contrato (sobre de respuesta del proyecto)
    expect(statusMock).toHaveBeenCalledWith(200);
    expect(jsonMock).toHaveBeenCalledWith({
      success: true,
      data: fakeEmployees,
      message: 'Empleados obtenidos',
    });
    expect(mockRepository.findAll).toHaveBeenCalledTimes(1);
  });

  it('Debería retornar 201 y la cabecera Location al crear un empleado', async () => {
    const controller = createEmployeeController(mockRepository);
    const created: Employee = {
      id: '507f1f77bcf86cd799439012',
      nombre: 'Lucía Salazar',
      cargo: 'Software Architect',
      departamento: 'I+D',
      sueldo: 4200,
    };

    mockRepository.create.mockResolvedValue(created);
    mockRequest = { body: { nombre: 'Lucía Salazar', cargo: 'Software Architect', departamento: 'I+D', sueldo: 4200 } };

    await controller.create(
      mockRequest as Request<object, unknown, typeof mockRequest.body>,
      mockResponse as Response,
      jest.fn(),
    );

    expect(statusMock).toHaveBeenCalledWith(201);
    expect(locationMock).toHaveBeenCalledWith(`/api/v1/empleados/${created.id}`);
    expect(jsonMock).toHaveBeenCalledWith({
      success: true,
      data: created,
      message: 'Empleado guardado',
    });
  });

  it('Debería propagar un AppError 404 cuando el empleado no existe (sin tocar la BD real)', async () => {
    const controller = createEmployeeController(mockRepository);
    mockRepository.findById.mockResolvedValue(null);
    mockRequest = { params: { id: '507f1f77bcf86cd799439099' } };

    await expect(
      controller.getById(
        mockRequest as Request<{ id: string }>,
        mockResponse as Response,
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(AppError);

    expect(mockRepository.findById).toHaveBeenCalledWith('507f1f77bcf86cd799439099');
    expect(statusMock).not.toHaveBeenCalled();
  });

  // --- Casos adicionales "buenos" (happy path) ---
  describe('Casos adicionales: happy path', () => {
    const existing: Employee = {
      id: '507f1f77bcf86cd799439013',
      nombre: 'Carla Ibarra',
      cargo: 'QA Lead',
      departamento: 'Calidad',
      sueldo: 3800,
    };

    it('getById: debería retornar 200 con el empleado cuando sí existe', async () => {
      const controller = createEmployeeController(mockRepository);
      mockRepository.findById.mockResolvedValue(existing);
      mockRequest = { params: { id: existing.id } };

      await controller.getById(mockRequest as Request<{ id: string }>, mockResponse as Response, jest.fn());

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: existing,
        message: 'Empleado obtenido',
      });
    });

    it('update: debería retornar 200 con el empleado actualizado', async () => {
      const controller = createEmployeeController(mockRepository);
      const updated: Employee = { ...existing, sueldo: 4500 };
      mockRepository.update.mockResolvedValue(updated);
      mockRequest = { params: { id: existing.id }, body: { sueldo: 4500 } };

      await controller.update(
        mockRequest as Request<{ id: string }, unknown, typeof mockRequest.body>,
        mockResponse as Response,
        jest.fn(),
      );

      expect(mockRepository.update).toHaveBeenCalledWith(existing.id, { sueldo: 4500 });
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: updated,
        message: 'Empleado actualizado',
      });
    });

    it('remove: debería retornar 204 sin cuerpo cuando el empleado se elimina', async () => {
      const controller = createEmployeeController(mockRepository);
      mockRepository.delete.mockResolvedValue(true);
      mockRequest = { params: { id: existing.id } };

      await controller.remove(mockRequest as Request<{ id: string }>, mockResponse as Response, jest.fn());

      expect(mockRepository.delete).toHaveBeenCalledWith(existing.id);
      expect(statusMock).toHaveBeenCalledWith(204);
      expect(sendMock).toHaveBeenCalledTimes(1);
    });
  });

  // --- Casos adicionales "malos" (errores esperados) ---
  describe('Casos adicionales: errores esperados', () => {
    it('update: debería propagar un AppError 404 si el empleado no existe', async () => {
      const controller = createEmployeeController(mockRepository);
      mockRepository.update.mockResolvedValue(null);
      mockRequest = { params: { id: '507f1f77bcf86cd799439099' }, body: { sueldo: 5000 } };

      await expect(
        controller.update(
          mockRequest as Request<{ id: string }, unknown, typeof mockRequest.body>,
          mockResponse as Response,
          jest.fn(),
        ),
      ).rejects.toBeInstanceOf(AppError);
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('remove: debería propagar un AppError 404 si el empleado no existe', async () => {
      const controller = createEmployeeController(mockRepository);
      mockRepository.delete.mockResolvedValue(false);
      mockRequest = { params: { id: '507f1f77bcf86cd799439099' } };

      await expect(
        controller.remove(mockRequest as Request<{ id: string }>, mockResponse as Response, jest.fn()),
      ).rejects.toBeInstanceOf(AppError);
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('list: debería propagar el error del repositorio sin atraparlo (lo maneja el errorMiddleware)', async () => {
      const controller = createEmployeeController(mockRepository);
      mockRepository.findAll.mockRejectedValue(new Error('fallo simulado de infraestructura'));
      mockRequest = {};

      await expect(
        controller.list(mockRequest as Request, mockResponse as Response, jest.fn()),
      ).rejects.toThrow('fallo simulado de infraestructura');
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('create: debería propagar el error del repositorio sin atraparlo (lo maneja el errorMiddleware)', async () => {
      const controller = createEmployeeController(mockRepository);
      mockRepository.create.mockRejectedValue(new Error('fallo simulado de infraestructura'));
      mockRequest = {
        body: { nombre: 'Ana Torres', cargo: 'Dev', departamento: 'TI', sueldo: 3000 },
      };

      await expect(
        controller.create(
          mockRequest as Request<object, unknown, typeof mockRequest.body>,
          mockResponse as Response,
          jest.fn(),
        ),
      ).rejects.toThrow('fallo simulado de infraestructura');
      expect(statusMock).not.toHaveBeenCalled();
    });
  });
});
