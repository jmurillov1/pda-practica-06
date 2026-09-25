import { TestBed } from '@angular/core/testing';
import type { Employee } from '../../../core/models/employee.model';
import { EmployeeFormComponent } from './employee-form.component';

describe('EmployeeFormComponent', () => {
  it('clona su @Input() y no lo muta al editar el formulario', () => {
    const original: Employee = {
      id: '1',
      nombre: 'Andrés Mendoza',
      cargo: 'Arquitecto de Software',
      departamento: 'Innovación',
      sueldo: 4500,
    };
    const originalSnapshot = { ...original };

    const fixture = TestBed.createComponent(EmployeeFormComponent);
    const component = fixture.componentInstance;
    component.employee = original;
    component.ngOnChanges();

    component.form.patchValue({ nombre: 'Otro Nombre', sueldo: 9999 });

    expect(original).toEqual(originalSnapshot);
  });

  it('emite save con los valores del formulario sin mutar el @Input() original', () => {
    const original: Employee = {
      id: '1',
      nombre: 'Andrés Mendoza',
      cargo: 'Arquitecto de Software',
      departamento: 'Innovación',
      sueldo: 4500,
    };

    const fixture = TestBed.createComponent(EmployeeFormComponent);
    const component = fixture.componentInstance;
    component.employee = original;
    component.ngOnChanges();

    let emitted: unknown;
    component.save.subscribe((value) => (emitted = value));

    component.form.patchValue({ nombre: 'Nuevo Nombre' });
    component.onSubmit();

    expect(emitted).toMatchObject({ nombre: 'Nuevo Nombre' });
    expect(original.nombre).toBe('Andrés Mendoza');
  });
});
