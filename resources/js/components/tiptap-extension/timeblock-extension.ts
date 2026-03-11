import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export type TimeblockEntry = {
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

type TimeblockOptions = {
    enabled: boolean;
    journalDate: string | null;
    defaultDurationMinutes: number;
};

type ParsedTimeblock = TimeblockEntry & {
    timeTokenEnd: number;
    firstTextOffset: number;
};

type InlineFragment = {
    text: string;
    offset: number;
};

type TimeblockPluginState = {
    decorations: DecorationSet;
    timeblocks: TimeblockEntry[];
};

const TIMEBLOCK_PLUGIN_KEY = new PluginKey<TimeblockPluginState>('timeblock');

const TIMEBLOCK_LINE_REGEX =
    /^(?<startHour>[01]?\d|2[0-3]):(?<startMinute>[0-5]\d)(?:\s*-\s*(?<endHour>[01]?\d|2[0-3]):(?<endMinute>[0-5]\d))?\s+(?<rest>.+)$/u;
const SINGLE_TIME_PREFIX_REGEX =
    /^(?<leading>\s*)(?<hour>[01]?\d|2[0-3]):(?<minute>[0-5]\d)(?!\s*-\s*(?:[01]?\d|2[0-3]):[0-5]\d)(?<space>\s+)/u;

function toIsoDate(value: string | null): Date | null {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return null;
    }

    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date;
}

function padTime(value: number): string {
    return String(value).padStart(2, '0');
}

function formatIsoLocal(date: Date): string {
    return [
        date.getFullYear(),
        padTime(date.getMonth() + 1),
        padTime(date.getDate()),
    ].join('-')
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

function gatherInlineFragments(node: PMNode): InlineFragment[] {
    const fragments: InlineFragment[] = [];

    node.descendants((child, childPos) => {
        if (
            child.type.name === 'bulletList' ||
            child.type.name === 'orderedList' ||
            child.type.name === 'taskList'
        ) {
            return false;
        }

        if (!child.isText || !child.text) {
            return;
        }

        fragments.push({
            text: child.text,
            offset: childPos,
        });
    });

    return fragments;
}

function parseTimeblockFromNode(
    node: PMNode,
    journalDate: Date,
    defaultDurationMinutes: number,
): ParsedTimeblock | null {
    if (node.type.name !== 'listItem' && node.type.name !== 'taskItem') {
        return null;
    }

    const fragments = gatherInlineFragments(node);
    const firstTextOffset = fragments[0]?.offset ?? -1;
    const line = fragments.map((fragment) => fragment.text).join('').trim();
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
        const endTotal = toMinutes(endHour, endMinute);

        if (endTotal <= startTotal) {
            return null;
        }
    } else {
        const duration = sanitizeDuration(defaultDurationMinutes);
        const endTotal = startTotal + duration;
        if (endTotal > 24 * 60) {
            return null;
        }

        endHour = Math.floor(endTotal / 60);
        endMinute = endTotal % 60;
    }

    const rest = (match.groups.rest ?? '').trim();
    if (rest === '') {
        return null;
    }

    const { title, location } = splitTitleAndLocation(rest);
    if (title === '') {
        return null;
    }

    const attrs = node.attrs ?? {};

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
            node.type.name === 'taskItem'
                ? {
                      checked: attrs.checked === true,
                      status: typeof attrs.taskStatus === 'string' ? attrs.taskStatus : null,
                  }
                : null,
        timeTokenEnd: (match[0] ?? '').length - rest.length - 1,
        firstTextOffset,
    };
}

function collectTimeblocks(
    doc: PMNode,
    options: TimeblockOptions,
): { timeblocks: TimeblockEntry[]; decorations: DecorationSet } {
    if (!options.enabled) {
        return {
            timeblocks: [],
            decorations: DecorationSet.empty,
        };
    }

    const journalDate = toIsoDate(options.journalDate);
    if (!journalDate) {
        return {
            timeblocks: [],
            decorations: DecorationSet.empty,
        };
    }

    const timeblocks: TimeblockEntry[] = [];
    const decorations: Decoration[] = [];

    doc.descendants((node, pos) => {
        if (node.type.name !== 'listItem' && node.type.name !== 'taskItem') {
            return true;
        }

        const parsed = parseTimeblockFromNode(
            node,
            journalDate,
            options.defaultDurationMinutes,
        );

        if (!parsed) {
            return true;
        }

        if (parsed.firstTextOffset < 0) {
            return true;
        }

        const tokenStart = pos + 1 + parsed.firstTextOffset;
        const tokenEnd = tokenStart + parsed.timeTokenEnd;

        if (tokenEnd > tokenStart) {
            decorations.push(
                Decoration.inline(tokenStart, tokenEnd, {
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
        timeblock: {
            timeblocks: TimeblockEntry[];
        };
    }
}

export const TimeblockExtension = Extension.create<TimeblockOptions>({
    name: 'timeblock',

    addOptions() {
        return {
            enabled: false,
            journalDate: null,
            defaultDurationMinutes: 60,
        };
    },

    addStorage() {
        return {
            timeblocks: [] as TimeblockEntry[],
        };
    },

    addProseMirrorPlugins() {
        const options = this.options;
        const storage = this.storage;

        return [
            new Plugin<TimeblockPluginState>({
                key: TIMEBLOCK_PLUGIN_KEY,
                state: {
                    init: (_config, state) => {
                        const nextState = collectTimeblocks(state.doc, options);
                        storage.timeblocks = nextState.timeblocks;

                        return nextState;
                    },
                    apply: (tr, value) => {
                        if (!tr.docChanged) {
                            return value;
                        }

                        const nextState = collectTimeblocks(tr.doc, options);
                        storage.timeblocks = nextState.timeblocks;

                        return nextState;
                    },
                },
                appendTransaction: (transactions, _oldState, newState) => {
                    if (!options.enabled) {
                        return null;
                    }

                    if (!transactions.some((transaction) => transaction.docChanged)) {
                        return null;
                    }

                    const { tr } = newState;
                    let changed = false;

                    newState.doc.descendants((node, pos) => {
                        if (node.type.name !== 'listItem' && node.type.name !== 'taskItem') {
                            return true;
                        }

                        let normalizedForNode = false;

                        node.descendants((child, childPos) => {
                            if (normalizedForNode) {
                                return false;
                            }

                            if (
                                child.type.name === 'bulletList' ||
                                child.type.name === 'orderedList' ||
                                child.type.name === 'taskList'
                            ) {
                                return false;
                            }

                            if (!child.isText || !child.text) {
                                return true;
                            }

                            const match = SINGLE_TIME_PREFIX_REGEX.exec(child.text);
                            if (!match?.groups) {
                                // Stop after first text token in this list line.
                                normalizedForNode = true;
                                return false;
                            }

                            const hour = Number(match.groups.hour);
                            const minute = Number(match.groups.minute);
                            const end = computeEndTime(
                                hour,
                                minute,
                                options.defaultDurationMinutes,
                            );

                            if (!end) {
                                normalizedForNode = true;
                                return false;
                            }

                            const token = `${padTime(hour)}:${padTime(minute)}`;
                            const replacement = `${token} - ${padTime(end.endHour)}:${padTime(end.endMinute)}`;
                            const localStart = (match.groups.leading ?? '').length;
                            const from = pos + 1 + childPos + localStart;
                            const to = from + token.length;

                            tr.insertText(replacement, from, to);
                            changed = true;
                            normalizedForNode = true;

                            return false;
                        });

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
