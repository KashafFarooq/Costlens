export class AppError extends Error {
  constructor(message, code = 'APP_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}
export class ValidationError extends AppError { constructor(message, code = 'VALIDATION_ERROR') { super(message, code); } }
export class CalculationError extends AppError { constructor(message, code = 'CALCULATION_ERROR') { super(message, code); } }
export class StorageError extends AppError { constructor(message, code = 'STORAGE_ERROR') { super(message, code); } }
export class ImportError extends AppError { constructor(message, code = 'IMPORT_ERROR') { super(message, code); } }
