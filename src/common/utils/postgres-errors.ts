import { QueryFailedError } from 'typeorm';

/** True if `error` is a Postgres unique violation (optionally on a given constraint/index). */
export function isUniqueViolation(
  error: unknown,
  constraint?: string,
): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }
  const driverError = error.driverError as {
    code?: string;
    constraint?: string;
  };
  return (
    driverError.code === '23505' &&
    (constraint === undefined || driverError.constraint === constraint)
  );
}
