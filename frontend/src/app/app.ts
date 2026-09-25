import { Component } from '@angular/core';
import { EmployeePageComponent } from './features/employees/employee-page.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [EmployeePageComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}
