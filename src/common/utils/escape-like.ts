/** Escapes %, _ and \ so user input is matched literally inside ILIKE. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
