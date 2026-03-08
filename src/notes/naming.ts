export function formatTimestamp(date: Date): string {
	const y = date.getFullYear().toString();
	const mo = (date.getMonth() + 1).toString().padStart(2, '0');
	const d = date.getDate().toString().padStart(2, '0');
	const h = date.getHours().toString().padStart(2, '0');
	const mi = date.getMinutes().toString().padStart(2, '0');
	const s = date.getSeconds().toString().padStart(2, '0');
	return `${y}${mo}${d}${h}${mi}${s}`;
}

export function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}
