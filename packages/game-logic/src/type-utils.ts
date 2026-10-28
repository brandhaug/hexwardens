import { Record as EffectRecord } from 'effect'

/**
 * Type-safe Object.keys — preserves the key type of known Record shapes.
 * Only use when you control the object (e.g., Record<KnownUnion, V>).
 */
export function typedKeys<K extends string, V>(
	obj: Partial<Record<K, V>>
): K[] {
	const keys: K[] = []
	for (const key in obj) {
		if (Object.hasOwn(obj, key)) {
			keys.push(key)
		}
	}
	return keys
}

/**
 * Type-safe Object.entries — preserves key and value types.
 */
export function typedEntries<K extends string, V>(obj: Record<K, V>): [K, V][] {
	return EffectRecord.toEntries(obj)
}

/**
 * Build a dynamic record; entry keys do not prove every member of a key union exists.
 */
export function typedFromEntries<V>(entries: [string, V][]): Record<string, V> {
	return Object.fromEntries(entries)
}

/**
 * Type-safe Array.includes that narrows the value.
 * Compare values without asserting that the input is already a member.
 */
export function includesValue<T>(
	arr: readonly T[],
	value: unknown
): value is T {
	return arr.some((item) => item === value)
}

/**
 * Type-safe key removal from a Record.
 * Preserves all entries except the requested key.
 */
export function omitKey<K extends string, V>(
	record: Record<K, V>,
	key: K
): Record<string, V> {
	return Object.fromEntries(
		EffectRecord.toEntries(record).filter(([candidate]) => candidate !== key)
	)
}

/**
 * Exhaustiveness check for discriminated unions.
 * Use in the default branch of switch statements.
 */
export function assertNever(value: never): never {
	throw new Error(`Unexpected value: ${String(value)}`)
}

/** Deep read view for plain engine data. Owners retain their mutable inputs. */
export type ReadonlyData<T> = { readonly [K in keyof T]: ReadonlyData<T[K]> }
