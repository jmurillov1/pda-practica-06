import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject, Subject, catchError, of, switchMap, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { ApiResponse } from '../models/api-response.model';
import type { CreateEmployee, Employee, UpdateEmployee } from '../models/employee.model';

const API_URL = `${environment.apiUrl}/empleados`;

@Injectable({ providedIn: 'root' })
export class EmployeeService {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);

  private readonly employeesSubject = new BehaviorSubject<Employee[]>([]);
  private readonly loadingSubject = new BehaviorSubject<boolean>(false);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);

  readonly employees$ = this.employeesSubject.asObservable();
  readonly loading$ = this.loadingSubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();

  // Cada comando (load/create/update/delete) empuja a su propio Subject de acción
  // en vez de suscribirse directamente en el método público. Los flujos reales se
  // arman una sola vez aquí abajo, en el constructor: así ningún componente llama
  // .subscribe() (Reto 3) y un doble clic no dispara dos peticiones en paralelo,
  // porque switchMap cancela la anterior.
  private readonly loadAction = new Subject<void>();
  private readonly createAction = new Subject<CreateEmployee>();
  private readonly updateAction = new Subject<{ id: string; data: UpdateEmployee }>();
  private readonly deleteAction = new Subject<string>();

  constructor() {
    this.loadAction
      .pipe(
        tap(() => this.beginRequest()),
        switchMap(() =>
          this.http.get<ApiResponse<Employee[]>>(API_URL).pipe(
            tap((response) => this.employeesSubject.next(response.data)),
            catchError((error: unknown) => this.handleError(error)),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.loadingSubject.next(false));

    this.createAction
      .pipe(
        tap(() => this.beginRequest()),
        switchMap((data) =>
          this.http.post<ApiResponse<Employee>>(API_URL, data).pipe(
            tap((response) =>
              this.employeesSubject.next([...this.employeesSubject.value, response.data]),
            ),
            catchError((error: unknown) => this.handleError(error)),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.loadingSubject.next(false));

    this.updateAction
      .pipe(
        tap(() => this.beginRequest()),
        switchMap(({ id, data }) =>
          this.http.put<ApiResponse<Employee>>(`${API_URL}/${id}`, data).pipe(
            tap((response) => {
              const updated = response.data;
              this.employeesSubject.next(
                this.employeesSubject.value.map((employee) =>
                  employee.id === updated.id ? updated : employee,
                ),
              );
            }),
            catchError((error: unknown) => this.handleError(error)),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.loadingSubject.next(false));

    this.deleteAction
      .pipe(
        tap(() => this.beginRequest()),
        switchMap((id) =>
          this.http.delete<void>(`${API_URL}/${id}`).pipe(
            tap(() => {
              this.employeesSubject.next(
                this.employeesSubject.value.filter((employee) => employee.id !== id),
              );
            }),
            catchError((error: unknown) => this.handleError(error)),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.loadingSubject.next(false));

    this.load();
  }

  load(): void {
    this.loadAction.next();
  }

  create(data: CreateEmployee): void {
    this.createAction.next(data);
  }

  update(id: string, data: UpdateEmployee): void {
    this.updateAction.next({ id, data });
  }

  remove(id: string): void {
    this.deleteAction.next(id);
  }

  private beginRequest(): void {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);
  }

  private handleError(error: unknown) {
    this.loadingSubject.next(false);
    this.errorSubject.next(this.extractMessage(error));
    return of(null);
  }

  private extractMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const body = error.error as ApiResponse<unknown> | undefined;
      if (body?.errors?.length) {
        return body.errors.map((e) => e.message).join(', ');
      }
      if (body?.message) {
        return body.message;
      }
    }
    return 'No se pudo completar la operación. Intenta de nuevo.';
  }
}
