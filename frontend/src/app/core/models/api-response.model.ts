export interface ApiError {
  field?: string;
  message: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
  errors?: ApiError[];
}
