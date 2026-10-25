const LEGACY_DIFFICULTY_LEVELS: Record<string, number> = {
  principiante: 3,
  intermedio: 6,
  avanzado: 9,
};

export function getDifficultyLevel(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(10, Math.max(1, Math.round(value)));
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    const numericValue = Number(normalized);

    if (normalized && Number.isFinite(numericValue)) {
      return Math.min(10, Math.max(1, Math.round(numericValue)));
    }

    if (normalized in LEGACY_DIFFICULTY_LEVELS) {
      return LEGACY_DIFFICULTY_LEVELS[normalized];
    }
  }

  return 5;
}
