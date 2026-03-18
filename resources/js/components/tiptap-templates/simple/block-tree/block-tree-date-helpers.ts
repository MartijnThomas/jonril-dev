function toIsoDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');

    return `${y}-${m}-${d}`;
}

function nextWeekday(now: Date, targetWeekday: number): Date {
    const currentWeekday = now.getDay();
    let diff = (targetWeekday - currentWeekday + 7) % 7;

    // Always advance to the NEXT occurrence, not today.
    if (diff === 0) {
        diff = 7;
    }

    const next = new Date(now);
    next.setDate(next.getDate() + diff);

    return next;
}

const WEEKDAY_MAP: Record<string, number> = {
    monday: 1,
    mon: 1,
    tuesday: 2,
    tue: 2,
    wednesday: 3,
    wed: 3,
    thursday: 4,
    thu: 4,
    friday: 5,
    fri: 5,
    saturday: 6,
    sat: 6,
    sunday: 0,
    sun: 0,
};

export const DATE_KEYWORDS = [
    'today',
    'tomorrow',
    'yesterday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
    'mon',
    'tue',
    'wed',
    'thu',
    'fri',
    'sat',
    'sun',
];

/**
 * Resolves a date keyword to an ISO date string (YYYY-MM-DD).
 * Also accepts unambiguous prefixes, e.g. "tom" → "tomorrow".
 *
 * Supported keywords:
 *   today, tomorrow, yesterday
 *   monday–sunday / mon–sun  (next occurrence)
 *   +Nd  (N days from today)
 *   +Nw  (N weeks from today)
 *   +Nm  (N months from today)
 */
export function resolveDateKeyword(keyword: string, now: Date = new Date()): string | null {
    const lower = keyword.toLowerCase();

    if (lower === 'today') {
        return toIsoDate(now);
    }

    if (lower === 'tomorrow') {
        const d = new Date(now);
        d.setDate(d.getDate() + 1);

        return toIsoDate(d);
    }

    if (lower === 'yesterday') {
        const d = new Date(now);
        d.setDate(d.getDate() - 1);

        return toIsoDate(d);
    }

    if (WEEKDAY_MAP[lower] !== undefined) {
        return toIsoDate(nextWeekday(now, WEEKDAY_MAP[lower]));
    }

    // Relative: +Nd, +Nw, +Nm
    const relMatch = /^\+(\d+)([dwm])$/i.exec(lower);

    if (relMatch) {
        const n = parseInt(relMatch[1], 10);
        const unit = relMatch[2].toLowerCase();
        const d = new Date(now);

        if (unit === 'd') {
            d.setDate(d.getDate() + n);
        } else if (unit === 'w') {
            d.setDate(d.getDate() + n * 7);
        } else if (unit === 'm') {
            d.setMonth(d.getMonth() + n);
        }

        return toIsoDate(d);
    }

    // Prefix matching: "tom" → "tomorrow", "wed" → "wednesday" only if unambiguous
    const matches = DATE_KEYWORDS.filter((k) => k.startsWith(lower) && k !== lower);

    if (matches.length === 1) {
        return resolveDateKeyword(matches[0], now);
    }

    return null;
}

// Matches `(>>?)(word or +Nd/+Nw/+Nm)` anchored at the end of the string.
// Does NOT require a preceding space — allows it at the start of the block.
const DATE_HELPER_RE = /(>>?)([a-zA-Z]+|\+\d+[dwm])$/;

export type DateHelperMatch = {
    /** Starting index in the text-before-cursor string */
    matchStart: number;
    /** Length of the full match (prefix + keyword) */
    matchLength: number;
    prefix: '>' | '>>';
    keyword: string;
};

/** Returns the date helper match sitting right before the cursor, or null. */
export function findDateHelperBeforeCursor(textBeforeCursor: string): DateHelperMatch | null {
    const match = DATE_HELPER_RE.exec(textBeforeCursor);

    if (!match) {
        return null;
    }

    return {
        matchStart: match.index,
        matchLength: match[0].length,
        prefix: match[1] as '>' | '>>',
        keyword: match[2],
    };
}

// Only autocomplete plain word keywords (not relative patterns).
const GHOST_RE = /(>>?)([a-zA-Z]{2,})$/;

/** Returns the ghost-text suffix to show after the cursor, or null. */
export function findDateGhostSuffix(textBeforeCursor: string): string | null {
    const match = GHOST_RE.exec(textBeforeCursor);

    if (!match) {
        return null;
    }

    const typed = match[2].toLowerCase();
    const full = DATE_KEYWORDS.find((k) => k.startsWith(typed) && k !== typed);

    if (!full) {
        return null;
    }

    return full.slice(typed.length) || null;
}
