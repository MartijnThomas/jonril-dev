export const ICON_COLOR_PROPERTY_KEY = 'icon-color';
export const ICON_BG_PROPERTY_KEY = 'icon-bg';

const ICON_COLOR_TOKEN_PATTERN =
    /^(?:text|bg)-(?:black|white|[a-z]+-(?:50|[1-9]00))$/;

export function sanitizeIconStyleToken(value: unknown): string {
    if (typeof value !== 'string') {
        return '';
    }

    const normalized = value.trim().toLowerCase();
    if (!normalized) {
        return '';
    }

    return ICON_COLOR_TOKEN_PATTERN.test(normalized) ? normalized : '';
}

export function tokenToCssColor(
    token: string | null | undefined,
    prefix: 'text' | 'bg',
): string | null {
    if (!token) {
        return null;
    }

    const normalized = sanitizeIconStyleToken(token);
    if (!normalized || !normalized.startsWith(`${prefix}-`)) {
        return null;
    }

    if (normalized === `${prefix}-black`) {
        return '#000';
    }

    if (normalized === `${prefix}-white`) {
        return '#fff';
    }

    const match = normalized.match(
        new RegExp(`^${prefix}-([a-z]+)-(50|[1-9]00)$`),
    );

    if (!match) {
        return null;
    }

    const colorName = match[1];
    const shade = match[2];

    return `var(--color-${colorName}-${shade})`;
}
