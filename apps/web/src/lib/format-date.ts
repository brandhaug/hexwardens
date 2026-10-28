const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', {
	numeric: 'auto'
})

const RELATIVE_DIVISIONS: Array<{
	amount: number
	name: Intl.RelativeTimeFormatUnit
}> = [
	{ amount: 60, name: 'seconds' },
	{ amount: 60, name: 'minutes' },
	{ amount: 24, name: 'hours' },
	{ amount: 7, name: 'days' },
	{ amount: 4.34524, name: 'weeks' },
	{ amount: 12, name: 'months' },
	{ amount: Number.POSITIVE_INFINITY, name: 'years' }
]

export function formatRelative(iso: string): string {
	const then = new Date(iso).getTime()
	if (Number.isNaN(then)) {
		return iso
	}
	let duration = (then - Date.now()) / 1000
	for (const division of RELATIVE_DIVISIONS) {
		if (Math.abs(duration) < division.amount) {
			return relativeTimeFormatter.format(Math.round(duration), division.name)
		}
		duration /= division.amount
	}
	return iso
}

export function formatAbsolute(iso: string): string {
	const d = new Date(iso)
	if (Number.isNaN(d.getTime())) {
		return iso
	}
	return d.toLocaleString(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short'
	})
}

export function formatDate(iso: string): string {
	const d = new Date(iso)
	if (Number.isNaN(d.getTime())) {
		return iso
	}
	return d.toLocaleDateString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	})
}
