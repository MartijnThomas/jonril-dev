import { usePage } from '@inertiajs/react';
import { useEffect, useSyncExternalStore } from 'react';

type TranslationTree = Record<string, unknown>;

type I18nStoreEntry = {
    version: string;
    ui: TranslationTree;
};

type PageI18nProps = {
    locale?: string;
    i18n?: {
        uiVersion?: string;
    };
};

const listeners = new Set<() => void>();
const store = new Map<string, I18nStoreEntry>();
const loading = new Map<string, Promise<void>>();
const initializedLocales = new Set<string>();

function storageKey(locale: string): string {
    return `i18n:ui:${locale}`;
}

function notify(): void {
    listeners.forEach((listener) => listener());
}

function resolveKey(tree: TranslationTree, key: string): string | null {
    const value = key.split('.').reduce<unknown>((carry, segment) => {
        if (typeof carry !== 'object' || carry === null) {
            return null;
        }

        return (carry as Record<string, unknown>)[segment];
    }, tree);

    return typeof value === 'string' ? value : null;
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
}

function getSnapshot(locale: string): TranslationTree {
    return store.get(locale)?.ui ?? {};
}

function loadFromStorage(locale: string): void {
    if (initializedLocales.has(locale) || typeof window === 'undefined') {
        return;
    }

    initializedLocales.add(locale);

    try {
        const raw = window.localStorage.getItem(storageKey(locale));
        if (!raw) {
            return;
        }

        const parsed = JSON.parse(raw) as Partial<I18nStoreEntry>;
        if (
            typeof parsed !== 'object'
            || parsed === null
            || typeof parsed.version !== 'string'
            || typeof parsed.ui !== 'object'
            || parsed.ui === null
            || Array.isArray(parsed.ui)
        ) {
            return;
        }

        store.set(locale, {
            version: parsed.version,
            ui: parsed.ui as TranslationTree,
        });
        notify();
    } catch {
        // ignore local parse/storage issues
    }
}

async function fetchTranslations(locale: string, currentVersion: string | null): Promise<void> {
    const query = new URLSearchParams({ locale });
    if (currentVersion && currentVersion !== '') {
        query.set('version', currentVersion);
    }

    const response = await fetch(`/i18n/ui?${query.toString()}`, {
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
    });
    if (!response.ok) {
        return;
    }

    const payload = (await response.json()) as {
        version?: string;
        ui?: TranslationTree;
        unchanged?: boolean;
    };

    if (payload.unchanged === true) {
        return;
    }

    if (
        typeof payload.version !== 'string'
        || typeof payload.ui !== 'object'
        || payload.ui === null
        || Array.isArray(payload.ui)
    ) {
        return;
    }

    store.set(locale, {
        version: payload.version,
        ui: payload.ui,
    });
    if (typeof window !== 'undefined') {
        window.localStorage.setItem(storageKey(locale), JSON.stringify({
            version: payload.version,
            ui: payload.ui,
        }));
    }
    notify();
}

function ensureTranslations(locale: string, serverVersion: string | null): void {
    loadFromStorage(locale);

    const cached = store.get(locale);
    const needsSync =
        !cached
        || (serverVersion !== null && serverVersion !== '' && cached.version !== serverVersion);

    if (!needsSync) {
        return;
    }

    if (loading.has(locale)) {
        return;
    }

    const request = fetchTranslations(locale, cached?.version ?? null)
        .catch(() => {
            // fail silent; fallback to key/fallback text in UI
        })
        .finally(() => {
            loading.delete(locale);
        });

    loading.set(locale, request);
}

export function useI18n() {
    const page = usePage().props as PageI18nProps;
    const locale = page.locale ?? 'en';
    const serverVersion = page.i18n?.uiVersion ?? null;

    const ui = useSyncExternalStore(
        subscribe,
        () => getSnapshot(locale),
        () => getSnapshot(locale),
    );

    useEffect(() => {
        ensureTranslations(locale, serverVersion);
    }, [locale, serverVersion]);

    return {
        locale,
        t: (key: string, fallback?: string) => resolveKey(ui, key) ?? fallback ?? key,
    };
}

