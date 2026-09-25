import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { Employee } from '../../../core/models/employee.model';

@Component({
  selector: 'app-employee-table',
  standalone: true,
  imports: [CurrencyPipe],
  templateUrl: './employee-table.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmployeeTableComponent {
  @Input() employees: Employee[] = [];
  @Output() edit = new EventEmitter<Employee>();
  @Output() remove = new EventEmitter<string>();

  onEdit(employee: Employee): void {
    this.edit.emit(employee);
  }

  onRemove(id: string): void {
    this.remove.emit(id);
  }

  trackById(_index: number, employee: Employee): string {
    return employee.id;
  }
}
