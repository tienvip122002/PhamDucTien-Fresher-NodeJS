import { ValueTransformer } from 'typeorm';

/**
 * Postgres returns NUMERIC columns as strings to avoid precision loss.
 * Prices here have 2 decimals and stay well inside JS number precision,
 * so we expose them as numbers in the API.
 */
export const decimalTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) =>
    value === null || value === undefined ? value : Number(value),
};
