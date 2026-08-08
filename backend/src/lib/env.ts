import { AppError } from './errors';

export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new AppError(500, 'CONFIGURATION_ERROR', `${name} is not configured`);
  }
  return value;
}
