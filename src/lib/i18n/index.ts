import { browser } from '$app/environment';
import { getLocale, setLocale, locales } from '$lib/paraglide/runtime';

export type SupportedLocale = (typeof locales)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'en';

const LOCALE_STORAGE_KEY = 'dockhand-locale';

/**
 * Validate a locale string and fall back to the default locale.
 */
export function getSupportedLocale(value: string | null | undefined): SupportedLocale {
	if (!value) return DEFAULT_LOCALE;
	return (locales as readonly string[]).includes(value) ? (value as SupportedLocale) : DEFAULT_LOCALE;
}

/**
 * Return the currently active locale.
 */
export function getCurrentLocale(): SupportedLocale {
	return getSupportedLocale(getLocale());
}

/**
 * Load the locale saved in localStorage (for flash-free client rendering).
 */
export function loadLocaleFromStorage(): SupportedLocale | null {
	if (!browser) return null;
	try {
		const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
		return stored ? getSupportedLocale(stored) : null;
	} catch {
		return null;
	}
}

/**
 * Persist the chosen locale to localStorage and, if a settings API endpoint is
 * provided, to the server. This mirrors the existing theme-preference pattern:
 * - global setting when auth is disabled (`/api/settings/general`)
 * - per-user preference when auth is enabled (`/api/profile/preferences`)
 */
export async function setActiveLocale(
	locale: SupportedLocale,
	options: { userId?: number; skipPersist?: boolean } = {}
): Promise<void> {
	setLocale(locale);

	if (browser) {
		try {
			localStorage.setItem(LOCALE_STORAGE_KEY, locale);
		} catch {
			// Ignore storage errors (e.g. private mode)
		}
	}

	if (options.skipPersist || !browser) return;

	const url = options.userId ? '/api/profile/preferences' : '/api/settings/general';
	const method = options.userId ? 'PUT' : 'POST';

	try {
		await fetch(url, {
			method,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ locale })
		});
	} catch (error) {
		console.error('Failed to persist locale preference:', error);
	}
}

/**
 * Build the list of languages shown in the UI selector.
 */
export function getLocaleOptions(): { value: SupportedLocale; label: string }[] {
	return [
		{ value: 'en', label: 'English' },
		{ value: 'zh-CN', label: '简体中文' }
	];
}
