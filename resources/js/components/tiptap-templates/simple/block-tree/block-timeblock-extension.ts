import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export type BlockTimeblockEntry = {
    blockId: string | null;
    startsAt: string;
    endsAt: string;
    startTime: string;
    endTime: string;
    hasExplicitEnd: boolean;
    title: string;
    location: string | null;
    task: {
        checked: boolean;
        status: string | null;
    } | null;
};

type BlockTimeblockOptions = {
    enabled: boolean;
    journalDate: string | null;
    defaultDurationMinutes: number;
};

type ParsedBlockTimeblock = BlockTimeblockEntry & {
    timeTokenEnd: number;
    textPrefixLength: number;
};

type BlockTimeblockPluginState = {
    decorations: DecorationSet;
    timeblocks: BlockTimeblockEntry[];
};

const BLOCK_TIMEBLOCK_PLUGIN_KEY = new PluginKey<BlockTimeblockPluginState>('blockTimeblock');

const TIMEBLOCK_LINE_REGEX =
    /^(?<startHour>[01]?\d|2[0-3]):(?<startMinute>[0-5]\d)(?:\s*-\s*(?<endHour>[01]?\d|2[0-3]):(?<endMinute>[0-5]\d))?\s+(?<rest>.+)$/u;

const SINGLE_TIME_PREFIX_REGEX =
    /^(?<leading>\s*)(?<hour>[01]?\d|2[0-3]):(?<minute>[0-5]\d)(?!\s*-\s*(?:[01]?\d|2[0-3]):[0-5]\d)(?<space>\s+)/u;

// Matches task status prefixes used in the block editor (e.g. "? ", "/ ", "- ", "* ", "< ")
const TASK_STATUS_PREFIX_REGEX = /^(?:\?|\/|-|\*|<)\s/u;

function toIsoDate(value: string | null): Date | null {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return null;
    }

    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
}

function padTime(value: number): string {
    return String(value).padStart(2, '0');
}

function formatIsoLocal(date: Date): string {
    return [
        date.getFullYear(),
        padTime(date.getMonth() + 1),
        padTime(date.getDate()),
    ]
        .join('-')
        .concat('T')
        .concat(`${padTime(date.getHours())}:${padTime(date.getMinutes())}:00`);
}

function toMinutes(hour: number, minute: number): number {
    return hour * 60 + minute;
}

function sanitizeDuration(value: number): number {
    return Math.max(5, Math.min(12 * 60, value));
}

function computeEndTime(
    startHour: number,
    startMinute: number,
    durationMinutes: number,
): { endHour: number; endMinute: number } | null {
    const startTotal = toMinutes(startHour, startMinute);
    const endTotal = startTotal + sanitizeDuration(durationMinutes);
    if (endTotal > 24 * 60) {
        return null;
    }

    return {
        endHour: Math.floor(endTotal / 60),
        endMinute: endTotal % 60,
    };
}

function splitTitleAndLocation(rest: string): { title: string; location: string | null } {
    const [title, location] = rest.split(/\s+@\s+/u, 2);
    const normalizedTitle = title?.trim() ?? '';
    const normalizedLocation = location?.trim() ?? '';

    return {
        title: normalizedTitle,
        location: normalizedLocation !== '' ? normalizedLocation : null,
    };
}

function parseTimeblockFromBlockNode(
    node: PMNode,
    journalDate: Date,
    defaultDurationMinutes: number,
): ParsedBlockTimeblock | null {
    if (node.type.name !== 'paragraph') {
        return null;
    }

    const attrs = node.attrs ?? {};
    const blockStyle = String(attrs.blockStyle ?? '');

    // Only bullet and task paragraphs are candidates for timeblocks
    if (blockStyle !== 'bullet' && blockStyle !== 'task') {
        return null;
    }

    const rawText = node.textContent;
    if (!rawText.trim()) {
        return null;
    }

    // Strip the task status prefix (e.g. "? ", "/ ", "- ", "* ", "< ") before parsing
    const prefixMatch = TASK_STATUS_PREFIX_REGEX.exec(rawText);
    const textPrefixLength = prefixMatch ? prefixMatch[0].length : 0;
    const line = rawText.slice(textPrefixLength).trim();

    if (!line) {
        return null;
    }

    const match = TIMEBLOCK_LINE_REGEX.exec(line);
    if (!match?.groups) {
        return null;
    }

    const startHour = Number(match.groups.startHour);
    const startMinute = Number(match.groups.startMinute);
    const hasExplicitEnd =
        typeof match.groups.endHour === 'string' &&
        match.groups.endHour !== '' &&
        typeof match.groups.endMinute === 'string' &&
        match.groups.endMinute !== '';

    const startTotal = toMinutes(startHour, startMinute);

    let endHour: number;
    let endMinute: number;

    if (hasExplicitEnd) {
        endHour = Number(match.groups.endHour);
        endMinute = Number(match.groups.endMinute);
        if (toMinutes(endHour, endMinute) <= startTotal) {
            return null;
        }
    } else {
        const end = computeEndTime(startHour, startMinute, defaultDurationMinutes);
        if (!end) {
            return null;
        }

        endHour = end.endHour;
        endMinute = end.endMinute;
    }

    const rest = (match.groups.rest ?? '').trim();
    if (!rest) {
        return null;
    }

    const { title, location } = splitTitleAndLocation(rest);
    if (!title) {
        return null;
    }

    const startsAt = new Date(journalDate);
    startsAt.setHours(startHour, startMinute, 0, 0);

    const endsAt = new Date(journalDate);
    endsAt.setHours(endHour, endMinute, 0, 0);

    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
        return null;
    }

    return {
        blockId: typeof attrs.id === 'string' ? attrs.id : null,
        startsAt: formatIsoLocal(startsAt),
        endsAt: formatIsoLocal(endsAt),
        startTime: `${padTime(startHour)}:${padTime(startMinute)}`,
        endTime: `${padTime(endHour)}:${padTime(endMinute)}`,
        hasExplicitEnd,
        title,
        location,
        task:
            blockStyle === 'task'
                ? {
                      checked: attrs.checked === true,
                      status: typeof attrs.taskStatus === 'string' ? attrs.taskStatus : null,
                  }
                : null,
        // Length of the time token (e.g. "10:00 - 11:00 ") within the stripped line
        timeTokenEnd: (match[0] ?? '').length - rest.length - 1,
        textPrefixLength,
    };
}

function collectBlockTimeblocks(
    doc: PMNode,
    options: BlockTimeblockOptions,
): { timeblocks: BlockTimeblockEntry[]; decorations: DecorationSet } {
    if (!options.enabled) {
        return { timeblocks: [], decorations: DecorationSet.empty };
    }

    const journalDate = toIsoDate(options.journalDate);
    if (!journalDate) {
        return { timeblocks: [], decorations: DecorationSet.empty };
    }

    const timeblocks: BlockTimeblockEntry[] = [];
    const decorations: Decoration[] = [];

    doc.descendants((node, pos) => {
        if (node.type.name !== 'paragraph') {
            return true;
        }

        const parsed = parseTimeblockFromBlockNode(node, journalDate, options.defaultDurationMinutes);
        if (!parsed) {
            return true;
        }

        // pos + 1 skips the paragraph's opening token; textPrefixLength skips the status prefix
        const contentStart = pos + 1 + parsed.textPrefixLength;
        const tokenEnd = contentStart + parsed.timeTokenEnd;

        if (tokenEnd > contentStart) {
            decorations.push(
                Decoration.inline(contentStart, tokenEnd, {
                    class: parsed.hasExplicitEnd
                        ? 'md-timeblock-time-token md-timeblock-time-token--range'
                        : 'md-timeblock-time-token md-timeblock-time-token--single',
                }),
            );
        }

        timeblocks.push({
            blockId: parsed.blockId,
            startsAt: parsed.startsAt,
            endsAt: parsed.endsAt,
            startTime: parsed.startTime,
            endTime: parsed.endTime,
            hasExplicitEnd: parsed.hasExplicitEnd,
            title: parsed.title,
            location: parsed.location,
            task: parsed.task,
        });

        return true;
    });

    return {
        timeblocks,
        decorations: DecorationSet.create(doc, decorations),
    };
}

declare module '@tiptap/core' {
    interface Storage {
        blockTimeblock: {
            timeblocks: BlockTimeblockEntry[];
        };
    }
}

export const BlockTimeblockExtension = Extension.create<BlockTimeblockOptions>({
    name: 'blockTimeblock',

    addOptions() {
        return {
            enabled: false,
            journalDate: null,
            defaultDurationMinutes: 60,
        };
    },

    addStorage() {
        return {
            timeblocks: [] as BlockTimeblockEntry[],
        };
    },

    addProseMirrorPlugins() {
        const options = this.options;
        const storage = this.storage;

        return [
            new Plugin<BlockTimeblockPluginState>({
                key: BLOCK_TIMEBLOCK_PLUGIN_KEY,
                state: {
                    init: (_config, state) => {
                        const next = collectBlockTimeblocks(state.doc, options);
                        storage.timeblocks = next.timeblocks;
                        return next;
                    },
                    apply: (tr, value) => {
                        if (!tr.docChanged) {
                            return value;
                        }

                        const next = collectBlockTimeblocks(tr.doc, options);
                        storage.timeblocks = next.timeblocks;
                        return next;
                    },
                },
                appendTransaction: (transactions, _oldState, newState) => {
                    if (!options.enabled) {
                        return null;
                    }

                    if (!transactions.some((tr) => tr.docChanged)) {
                        return null;
                    }

                    const { tr } = newState;
                    let changed = false;

                    newState.doc.descendants((node, pos) => {
                        if (node.type.name !== 'paragraph') {
                            return true;
                        }

                        const blockStyle = String(node.attrs?.blockStyle ?? '');
                        if (blockStyle !== 'bullet' && blockStyle !== 'task') {
                            return true;
                        }

                        const rawText = node.textContent;
                        const prefixMatch = TASK_STATUS_PREFIX_REGEX.exec(rawText);
                        const textPrefixLength = prefixMatch ? prefixMatch[0].length : 0;
                        const textAfterPrefix = rawText.slice(textPrefixLength);

                        const match = SINGLE_TIME_PREFIX_REGEX.exec(textAfterPrefix);
                        if (!match?.groups) {
                            return true;
                        }

                        const hour = Number(match.groups.hour);
                        const minute = Number(match.groups.minute);
                        const end = computeEndTime(hour, minute, options.defaultDurationMinutes);
                        if (!end) {
                            return true;
                        }

                        const token = `${padTime(hour)}:${padTime(minute)}`;
                        const replacement = `${token} - ${padTime(end.endHour)}:${padTime(end.endMinute)}`;
                        const localStart = (match.groups.leading ?? '').length;
                        const from = pos + 1 + textPrefixLength + localStart;
                        const to = from + token.length;

                        tr.insertText(replacement, from, to);
                        changed = true;

                        return true;
                    });

                    return changed ? tr : null;
                },
                props: {
                    decorations(state) {
                        return this.getState(state)?.decorations ?? DecorationSet.empty;
                    },
                },
            }),
        ];
    },
});
