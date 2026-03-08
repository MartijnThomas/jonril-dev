import { usePage } from '@inertiajs/react';

type TranslationTree = Record<string, unknown>;

function resolveKey(tree: TranslationTree, key: string): string | null {
    const value = key.split('.').reduce<unknown>((carry, segment) => {
        if (typeof carry !== 'object' || carry === null) {
            return null;
        }

        return (carry as Record<string, unknown>)[segment];
    }, tree);

    return typeof value === 'string' ? value : null;
}

export function useI18n() {
    const page = usePage().props as {
        locale?: string;
        translations?: {
            ui?: TranslationTree;
        };
    };

    const locale = page.locale ?? 'en';
    const ui = page.translations?.ui ?? {};

    return {
        locale,
        t: (key: string, fallback?: string) => resolveKey(ui, key) ?? fallback ?? key,
    };
}
