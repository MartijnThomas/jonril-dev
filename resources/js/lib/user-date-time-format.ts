import { format } from 'date-fns';

export type AppLanguage = 'nl' | 'en';

export type LongDateFormatKey =
    | 'weekday_day_month_year'
    | 'weekday_month_day_year'
    | 'day_month_year'
    | 'iso_date';

export type ShortDateFormatKey =
    | 'weekday_day_month_short_year'
    | 'day_month_short_year'
    | 'numeric_day_month_year'
    | 'iso_date';

export type TimeFormatKey = '24h' | '12h';

export const LONG_DATE_FORMAT_KEYS: LongDateFormatKey[] = [
    'weekday_day_month_year',
    'weekday_month_day_year',
    'day_month_year',
    'iso_date',
];

export const SHORT_DATE_FORMAT_KEYS: ShortDateFormatKey[] = [
    'weekday_day_month_short_year',
    'day_month_short_year',
    'numeric_day_month_year',
    'iso_date',
];

export const TIME_FORMAT_KEYS: TimeFormatKey[] = ['24h', '12h'];

const LONG_DATE_PATTERNS: Record<LongDateFormatKey, string> = {
    weekday_day_month_year: 'EEEE d MMMM yyyy',
    weekday_month_day_year: 'EEEE MMMM d, yyyy',
    day_month_year: 'd MMMM yyyy',
    iso_date: 'yyyy-MM-dd',
};

const SHORT_DATE_PATTERNS: Record<ShortDateFormatKey, string> = {
    weekday_day_month_short_year: "EEE d MMM ''yy",
    day_month_short_year: "d MMM ''yy",
    numeric_day_month_year: 'dd-MM-yy',
    iso_date: 'yyyy-MM-dd',
};

const TIME_PATTERNS: Record<TimeFormatKey, string> = {
    '24h': 'HH:mm',
    '12h': 'h:mm a',
};

export function defaultLongDateFormatForLanguage(language: AppLanguage): LongDateFormatKey {
    return language === 'en' ? 'weekday_month_day_year' : 'weekday_day_month_year';
}

export function defaultShortDateFormatForLanguage(
    language: AppLanguage,
): ShortDateFormatKey {
    return language === 'en'
        ? 'weekday_day_month_short_year'
        : 'weekday_day_month_short_year';
}

export function defaultTimeFormatForLanguage(language: AppLanguage): TimeFormatKey {
    return language === 'en' ? '12h' : '24h';
}

export function resolveLongDateFormat(
    value: unknown,
    language: AppLanguage,
): LongDateFormatKey {
    if (typeof value === 'string' && LONG_DATE_FORMAT_KEYS.includes(value as LongDateFormatKey)) {
        return value as LongDateFormatKey;
    }

    return defaultLongDateFormatForLanguage(language);
}

export function resolveShortDateFormat(
    value: unknown,
    language: AppLanguage,
): ShortDateFormatKey {
    if (
        typeof value === 'string' &&
        SHORT_DATE_FORMAT_KEYS.includes(value as ShortDateFormatKey)
    ) {
        return value as ShortDateFormatKey;
    }

    return defaultShortDateFormatForLanguage(language);
}

export function resolveTimeFormat(
    value: unknown,
    language: AppLanguage,
): TimeFormatKey {
    if (typeof value === 'string' && TIME_FORMAT_KEYS.includes(value as TimeFormatKey)) {
        return value as TimeFormatKey;
    }

    return defaultTimeFormatForLanguage(language);
}

export function formatLongDate(
    date: Date,
    dateLocale: Locale,
    formatKey: LongDateFormatKey,
): string {
    return format(date, LONG_DATE_PATTERNS[formatKey], { locale: dateLocale });
}

export function formatShortDate(
    date: Date,
    dateLocale: Locale,
    formatKey: ShortDateFormatKey,
): string {
    return format(date, SHORT_DATE_PATTERNS[formatKey], { locale: dateLocale });
}

export function formatClockTime(
    date: Date,
    formatKey: TimeFormatKey,
): string {
    return format(date, TIME_PATTERNS[formatKey]);
}
