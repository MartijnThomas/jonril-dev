export type BlockWikiLinkNote = {
    id: string;
    title: string;
    path?: string;
    href?: string;
    headings?: {
        id: string;
        title: string;
        level: number | null;
    }[];
};

export type BlockWikiLinkSuggestionItem = {
    id: string;
    title: string;
    targetPath: string;
    targetBlockId?: string | null;
    noteId?: string | null;
    href?: string | null;
    subtitle?: string;
    kind: 'note' | 'journal' | 'create' | 'heading';
    insertText: string;
};

export type RawWikiLinkMatch = {
    from: number;
    to: number;
    inner: string;
    full: string;
};

export function workspaceSlugFromPathname(pathname: string): string | null {
    const match = pathname.match(/^\/w\/([^/]+)\//);
    if (!match) {
        return null;
    }

    return decodeURIComponent(match[1] ?? '').trim() || null;
}

export function encodeWikiTargetPath(path: string): string {
    return path
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
}

export function fallbackBlockWikiHrefFromTargetPath(
    targetPath: string,
    noteId?: string | null,
    targetBlockId?: string | null,
): string {
    const normalizedTargetPath = targetPath.trim().replace(/^\/+|\/+$/g, '');
    const hash = typeof targetBlockId === 'string' && targetBlockId.trim() !== ''
        ? `#${encodeURIComponent(targetBlockId.trim())}`
        : '';

    if (typeof window !== 'undefined') {
        const workspaceSlug = workspaceSlugFromPathname(window.location.pathname);

        if (workspaceSlug) {
            if (normalizedTargetPath.startsWith('journal/')) {
                const journalMatch = normalizedTargetPath.match(
                    /^journal\/(daily|weekly|monthly|yearly)\/(.+)$/,
                );
                if (journalMatch) {
                    const period = encodeWikiTargetPath(journalMatch[2] ?? '');
                    return `/w/${workspaceSlug}/journal/${period}${hash}`;
                }
            }

            return `/w/${workspaceSlug}/notes/${encodeWikiTargetPath(normalizedTargetPath)}${hash}`;
        }
    }

    if (noteId) {
        return `/notes/${noteId}${hash}`;
    }

    if (normalizedTargetPath.startsWith('journal/')) {
        const journalMatch = normalizedTargetPath.match(
            /^journal\/(daily|weekly|monthly|yearly)\/(.+)$/,
        );

        if (journalMatch) {
            const period = encodeWikiTargetPath(journalMatch[2] ?? '');
            return `/journal/${period}${hash}`;
        }
    }

    return `/notes/${encodeWikiTargetPath(normalizedTargetPath)}${hash}`;
}

export function deriveTargetPathFromNote(note: BlockWikiLinkNote): string {
    const href = (note.href ?? '').trim();
    if (href !== '') {
        const periodJournalMatch = href.match(/\/journal\/([^/?#]+)/);
        if (periodJournalMatch) {
            const normalized = normalizeJournalTargetPath(
                `journal/${decodeURIComponent(periodJournalMatch[1] ?? '')}`,
            );

            if (normalized) {
                return normalized;
            }
        }

        const journalMatch = href.match(/\/journal\/(daily|weekly|monthly|yearly)\/([^?#]+)/);
        if (journalMatch) {
            const granularity = journalMatch[1] ?? '';
            const period = decodeURIComponent(journalMatch[2] ?? '');

            return `journal/${granularity}/${period}`;
        }

        const noteMatch = href.match(/\/notes\/([^?#]+)/);
        if (noteMatch) {
            return decodeURIComponent(noteMatch[1] ?? note.id);
        }
    }

    return note.id;
}

export function slugifySegment(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export function normalizeNoteTargetPath(rawPath: string): string {
    return rawPath
        .split('/')
        .map((segment) => slugifySegment(segment))
        .filter((segment) => segment.length > 0)
        .join('/');
}

export function normalizeJournalTargetPath(rawPath: string): string | null {
    const normalized = rawPath.trim().replace(/^\/+|\/+$/g, '');
    const rules: Record<string, RegExp> = {
        daily: /^\d{4}-\d{2}-\d{2}$/,
        weekly: /^\d{4}-W\d{2}$/,
        monthly: /^\d{4}-\d{2}$/,
        yearly: /^\d{4}$/,
    };

    const legacyMatch = normalized.match(
        /^journal\/(daily|weekly|monthly|yearly)\/(.+)$/i,
    );
    if (legacyMatch) {
        const granularity = (legacyMatch[1] ?? '').toLowerCase();
        const period = (legacyMatch[2] ?? '').trim();
        if (!period || !rules[granularity]?.test(period)) {
            return null;
        }

        return `journal/${granularity}/${period}`;
    }

    const simpleMatch = normalized.match(/^journal\/(.+)$/i);
    if (!simpleMatch) {
        return null;
    }

    const period = (simpleMatch[1] ?? '').trim();
    if (period === '') {
        return null;
    }

    if (rules.daily.test(period)) {
        return `journal/daily/${period}`;
    }

    if (rules.weekly.test(period)) {
        return `journal/weekly/${period}`;
    }

    if (rules.monthly.test(period)) {
        return `journal/monthly/${period}`;
    }

    if (rules.yearly.test(period)) {
        return `journal/yearly/${period}`;
    }

    return null;
}

export function editableJournalPathFromTargetPath(targetPath: string): string | null {
    const match = targetPath
        .trim()
        .match(/^journal\/(daily|weekly|monthly|yearly)\/(.+)$/i);
    if (!match) {
        return null;
    }

    const period = (match[2] ?? '').trim();
    if (!period) {
        return null;
    }

    return `journal/${period}`;
}

function capitalizeFirst(value: string): string {
    if (value.length === 0) {
        return value;
    }

    return value.charAt(0).toUpperCase() + value.slice(1);
}

function humanizePathSegment(segment: string): string {
    const decoded = decodeURIComponent(segment);
    const normalized = decoded
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (normalized === '') {
        return decoded;
    }

    return normalized
        .split(' ')
        .map((part) => capitalizeFirst(part.toLowerCase()))
        .join(' ');
}

function journalDisplayTitle(
    granularity: 'daily' | 'weekly' | 'monthly' | 'yearly',
    period: string,
    language: string,
): string | null {
    if (granularity === 'yearly') {
        return period;
    }

    if (granularity === 'weekly') {
        const match = period.match(/^(\d{4})-W(\d{2})$/);
        if (!match) {
            return null;
        }

        return `Week ${Number(match[2])} ${match[1]}`;
    }

    const locale = language === 'en' ? 'en-GB' : 'nl-NL';
    const date = new Date(`${period}${granularity === 'monthly' ? '-01' : ''}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    if (granularity === 'monthly') {
        return capitalizeFirst(
            new Intl.DateTimeFormat(locale, {
                month: 'long',
                year: 'numeric',
            }).format(date),
        );
    }

    return capitalizeFirst(
        new Intl.DateTimeFormat(locale, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        }).format(date),
    );
}

export function displayTitleFromTargetPath(
    targetPath: string,
    language: string = 'nl',
): string {
    const normalized = targetPath.trim().replace(/^\/+|\/+$/g, '');
    const journalMatch = normalized.match(
        /^journal\/(daily|weekly|monthly|yearly)\/(.+)$/i,
    );

    if (journalMatch) {
        const granularity = (journalMatch[1] ?? '').toLowerCase() as
            | 'daily'
            | 'weekly'
            | 'monthly'
            | 'yearly';
        const period = (journalMatch[2] ?? '').trim();
        const journalTitle = journalDisplayTitle(granularity, period, language);

        if (journalTitle) {
            return journalTitle;
        }
    }

    const segment = normalized.split('/').filter(Boolean).at(-1) ?? normalized;

    return humanizePathSegment(segment);
}

export function parseWikiLinkQuery(query: string): {
    rawPath: string;
    rawHeading: string;
} {
    const trimmed = query.trim();
    const dividerIndex = trimmed.indexOf('|');
    const pathAndHeading =
        dividerIndex === -1
            ? trimmed
            : trimmed.slice(0, dividerIndex).trim();
    const headingDividerIndex = pathAndHeading.indexOf('#');

    if (headingDividerIndex === -1) {
        return {
            rawPath: pathAndHeading.trim(),
            rawHeading: '',
        };
    }

    return {
        rawPath: pathAndHeading.slice(0, headingDividerIndex).trim(),
        rawHeading: pathAndHeading.slice(headingDividerIndex + 1).trim(),
    };
}

export function normalizeHeadingText(value: string): string {
    return value.trim().toLowerCase();
}

export function wikiLinkEditableQueryFromTarget(
    targetPath: string,
    headingTitle?: string | null,
): string {
    const editablePath = editableJournalPathFromTargetPath(targetPath) || targetPath;
    const cleanHeading = (headingTitle ?? '').trim();

    if (cleanHeading === '') {
        return editablePath;
    }

    return `${editablePath}# ${cleanHeading}`;
}

export function findCompleteRawWikiLinks(text: string): RawWikiLinkMatch[] {
    const matches: RawWikiLinkMatch[] = [];
    let index = 0;

    while (index < text.length) {
        const start = text.indexOf('[[', index);
        if (start === -1) {
            break;
        }

        if (start > 0 && text[start - 1] === '[') {
            index = start + 1;
            continue;
        }

        const close = text.indexOf(']]', start + 2);
        if (close === -1) {
            break;
        }

        const afterClose = close + 2;
        if (afterClose < text.length && text[afterClose] === ']') {
            index = start + 1;
            continue;
        }

        const inner = text.slice(start + 2, close).trim();
        if (inner === '' || inner.includes('[') || inner.includes(']')) {
            index = close + 2;
            continue;
        }

        matches.push({
            from: start,
            to: close + 2,
            inner,
            full: text.slice(start, close + 2),
        });

        index = close + 2;
    }

    return matches;
}

const MONTHS: Record<string, number> = {
    january: 1,
    jan: 1,
    januari: 1,
    february: 2,
    feb: 2,
    februari: 2,
    march: 3,
    mar: 3,
    maart: 3,
    april: 4,
    may: 5,
    mei: 5,
    june: 6,
    jun: 6,
    juni: 6,
    july: 7,
    jul: 7,
    juli: 7,
    august: 8,
    aug: 8,
    augustus: 8,
    september: 9,
    sep: 9,
    october: 10,
    oct: 10,
    oktober: 10,
    november: 11,
    nov: 11,
    december: 12,
    dec: 12,
};

export function buildProgressiveJournalSuggestions(
    rawPath: string,
    existingTargets: Set<string>,
    language: string = 'nl',
): BlockWikiLinkSuggestionItem[] {
    const query = rawPath.trim().toLowerCase();
    const suggestions: BlockWikiLinkSuggestionItem[] = [];

    const push = (targetPath: string, title: string) => {
        const key = targetPath.toLowerCase();
        if (existingTargets.has(key)) {
            return;
        }

        suggestions.push({
            id: `journal:${targetPath}`,
            title,
            targetPath,
            kind: 'journal',
            subtitle: targetPath,
            insertText: title,
            noteId: null,
            href: fallbackBlockWikiHrefFromTargetPath(targetPath),
        });

        existingTargets.add(key);
    };

    const dailyMatch = query.match(/^(\d{4}-\d{2}-\d{2})$/);
    if (dailyMatch) {
        const period = dailyMatch[1] ?? '';
        const targetPath = `journal/daily/${period}`;
        push(targetPath, displayTitleFromTargetPath(targetPath, language));
    }

    const weeklyMatch = query.match(/^(\d{4}-w\d{2})$/i);
    if (weeklyMatch) {
        const period = (weeklyMatch[1] ?? '').toUpperCase();
        const targetPath = `journal/weekly/${period}`;
        push(targetPath, displayTitleFromTargetPath(targetPath, language));
    }

    const monthlyMatch = query.match(/^(\d{4}-\d{2})$/);
    if (monthlyMatch) {
        const period = monthlyMatch[1] ?? '';
        const targetPath = `journal/monthly/${period}`;
        push(targetPath, displayTitleFromTargetPath(targetPath, language));
    }

    const yearlyMatch = query.match(/^(\d{4})$/);
    if (yearlyMatch) {
        const period = yearlyMatch[1] ?? '';
        const targetPath = `journal/yearly/${period}`;
        push(targetPath, displayTitleFromTargetPath(targetPath, language));
    }

    const words = query.split(/\s+/).filter(Boolean);
    const month = words
        .map((word) => MONTHS[word])
        .find((value) => typeof value === 'number');
    const year = words
        .map((word) => Number.parseInt(word, 10))
        .find((value) => Number.isInteger(value) && value >= 1900 && value <= 2200);

    if (month) {
        const currentYear = new Date().getFullYear();
        const years =
            typeof year === 'number'
                ? [year]
                : [currentYear - 1, currentYear, currentYear + 1];

        years.forEach((itemYear) => {
            const period = `${itemYear}-${String(month).padStart(2, '0')}`;
            push(`journal/monthly/${period}`, `Monthly journal ${period}`);
        });
    }

    return suggestions.slice(0, 6);
}
