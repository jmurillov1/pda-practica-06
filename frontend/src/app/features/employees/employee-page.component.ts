import { AsyncPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { EmployeeService } from '../../core/services/employee.service';
import type { CreateEmployee, Employee } from '../../core/models/employee.model';
import { EmployeeFormComponent } from './components/employee-form.component';
import { EmployeeTableComponent } from './components/employee-table.component';

@Component({
  selector: 'app-employee-page',
  standalone: true,
  imports: [AsyncPipe, EmployeeFormComponent, EmployeeTableComponent],
  templateUrl: './employee-page.component.html',
})
export class EmployeePageComponent {
  private readonly employeeService = inject(EmployeeService);

  readonly employees$ = this.employeeService.employees$;
  readonly loading$ = this.employeeService.loading$;
  readonly error$ = this.employeeService.error$;

  employeeToEdit: Employee | null = null;

  onEdit(employee: Employee): void {
    this.employeeToEdit = employee;
  }

  onRemove(id: string): void {
    this.employeeService.remove(id);
    if (this.employeeToEdit?.id === id) {
      this.employeeToEdit = null;
    }
  }

  onSave(data: CreateEmployee): void {
    if (this.employeeToEdit) {
      this.employeeService.update(this.employeeToEdit.id, data);
      this.employeeToEdit = null;
    } else {
      this.employeeService.create(data);
    }
  }

  onCancel(): void {
    this.employeeToEdit = null;
  }
}
