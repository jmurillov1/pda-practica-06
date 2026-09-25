import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type { CreateEmployee, Employee } from '../../../core/models/employee.model';

@Component({
  selector: 'app-employee-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './employee-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmployeeFormComponent implements OnChanges {
  @Input() employee: Employee | null = null;
  @Output() save = new EventEmitter<CreateEmployee>();
  @Output() cancelled = new EventEmitter<void>();

  private readonly formBuilder = new FormBuilder();

  readonly form = this.formBuilder.group({
    nombre: ['', [Validators.required, Validators.minLength(3)]],
    cargo: ['', [Validators.required, Validators.minLength(3)]],
    departamento: ['', [Validators.required, Validators.minLength(3)]],
    sueldo: [0, [Validators.required, Validators.min(0.01)]],
  });

  ngOnChanges(): void {
    // Se clona el @Input() en vez de leerlo directamente: el formulario es un
    // dumb component y no debe mutar el objeto que le pasó el padre, o la fila
    // correspondiente en la tabla cambiaría antes de guardar (Reto 4).
    const clone = this.employee ? { ...this.employee } : null;
    this.form.reset({
      nombre: clone?.nombre ?? '',
      cargo: clone?.cargo ?? '',
      departamento: clone?.departamento ?? '',
      sueldo: clone?.sueldo ?? 0,
    });
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.save.emit({
      nombre: value.nombre ?? '',
      cargo: value.cargo ?? '',
      departamento: value.departamento ?? '',
      sueldo: value.sueldo ?? 0,
    });
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
