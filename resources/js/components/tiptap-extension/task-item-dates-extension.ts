import { TaskItem } from '@tiptap/extension-list';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

declare module '@tiptap/extension-list' {
    interface TaskItemOptions {
        displayLocale: string;
    }
}

type ParsedTaskDates = {
    dueDate: string | null;
    deadlineDate: string | null;
    dueDateMode: 'today' | null;
    deadlineDateMode: 'today' | null;
};

type TaskToken = {
    prefix: '>' | '>>';
    value: string;
    start: number;
    end: number;
};

const TASK_TOKEN_REGEX = /(>>?)(\d{4}-\d{2}-\d{2}|[a-zA-Z]+)/g;
const HELPER_KEYWORDS = [
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
] as const;

function toIsoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function isValidIsoDate(value: string): boolean {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
        return false;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    );
}

function parseTaskTokens(text: string): TaskToken[] {
    const tokens: TaskToken[] = [];

    for (const match of text.matchAll(TASK_TOKEN_REGEX)) {
        const raw = match[0];
        const prefix = match[1] as '>' | '>>';
        const value = match[2];
        const start = match.index ?? -1;

        if (start < 0) {
            continue;
        }

        tokens.push({
            prefix,
            value,
            start,
            end: start + raw.length,
        });
    }

    return tokens;
}

function nextWeekday(now: Date, targetWeekday: number): Date {
    const currentWeekday = now.getDay();
    let diff = (targetWeekday - currentWeekday + 7) % 7;

    // "monday" means next monday, not today.
    if (diff === 0) {
        diff = 7;
    }

    const next = new Date(now);
    next.setDate(next.getDate() + diff);

    return next;
}

function resolveDateKeyword(keyword: string, now: Date): string | null {
    const lower = keyword.toLowerCase();

    if (lower === 'today') {
        return toIsoDate(now);
    }

    if (lower === 'tomorrow') {
        const date = new Date(now);
        date.setDate(date.getDate() + 1);

        return toIsoDate(date);
    }

    if (lower === 'yesterday') {
        const date = new Date(now);
        date.setDate(date.getDate() - 1);

        return toIsoDate(date);
    }

    const weekdayMap: Record<string, number> = {
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

    if (weekdayMap[lower] !== undefined) {
        return toIsoDate(nextWeekday(now, weekdayMap[lower]));
    }

    return null;
}

function formatLocalizedDate(isoDate: string, localeTag: string): string {
    if (!isValidIsoDate(isoDate)) {
        return isoDate;
    }

    const date = new Date(`${isoDate}T00:00:00`);

    return new Intl.DateTimeFormat(localeTag, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    }).format(date);
}

function parseTaskDates(text: string): ParsedTaskDates {
    let dueDate: string | null = null;
    let deadlineDate: string | null = null;
    let dueDateMode: 'today' | null = null;
    let deadlineDateMode: 'today' | null = null;
    const now = new Date();

    for (const token of parseTaskTokens(text)) {
        const lowerValue = token.value.toLowerCase();
        const resolvedValue = isValidIsoDate(token.value)
            ? token.value
            : resolveDateKeyword(token.value, now);

        if (!resolvedValue) {
            continue;
        }

        if (token.prefix === '>>') {
            deadlineDate = resolvedValue;
            deadlineDateMode = lowerValue === 'today' ? 'today' : null;
        } else {
            dueDate = resolvedValue;
            dueDateMode = lowerValue === 'today' ? 'today' : null;
        }
    }

    return { dueDate, deadlineDate, dueDateMode, deadlineDateMode };
}

function getTaskItemLineText(node: any): string {
    const parts: string[] = [];

    node.forEach((child: any) => {
        // Ignore nested lists; only parse this task line text.
        if (
            child.type.name === 'bulletList' ||
            child.type.name === 'orderedList'
        ) {
            return;
        }

        if (child.type.name === 'taskList') {
            return;
        }

        parts.push(child.textContent ?? '');
    });

    return parts.join('\n');
}

function isInsideTaskItem(doc: any, pos: number): boolean {
    const safePos = Math.max(0, Math.min(pos, doc.content.size));
    const resolved = doc.resolve(safePos);

    for (let depth = resolved.depth; depth >= 0; depth -= 1) {
        if (resolved.node(depth).type.name === 'taskItem') {
            return true;
        }
    }

    return false;
}

function findHelperSuggestion(textBeforeCursor: string): string | null {
    const helperMatch = /(?:^|\s)(>>?)([a-zA-Z]+)$/.exec(textBeforeCursor);
    if (!helperMatch) {
        return null;
    }

    const typed = helperMatch[2].toLowerCase();
    if (typed.length < 2) {
        return null;
    }

    const suggestion = HELPER_KEYWORDS.find(
        (keyword) => keyword.startsWith(typed) && keyword !== typed,
    );

    if (!suggestion) {
        return null;
    }

    const suffix = suggestion.slice(typed.length);

    return suffix || null;
}

function getHelperCompletionAtSelection(state: any): string | null {
    const { from, to } = state.selection;
    if (from !== to) {
        return null;
    }

    let completion: string | null = null;

    state.doc.descendants((node: any, pos: number) => {
        if (completion || !node.isText || !node.text) {
            return;
        }

        const textLength = node.text.length as number;
        const isInsideTextNode = from >= pos && from <= pos + textLength;
        if (!isInsideTextNode || !isInsideTaskItem(state.doc, pos)) {
            return;
        }

        const localOffset = from - pos;
        const textBeforeCursor = node.text.slice(0, localOffset);
        completion = findHelperSuggestion(textBeforeCursor);
    });

    return completion;
}

type HelperTokenAtSelection = {
    from: number;
    to: number;
    prefix: '>' | '>>';
    typed: string;
};

function getHelperTokenAtSelection(state: any): HelperTokenAtSelection | null {
    const { from, to } = state.selection;
    if (from !== to) {
        return null;
    }

    let token: HelperTokenAtSelection | null = null;

    state.doc.descendants((node: any, pos: number) => {
        if (token || !node.isText || !node.text) {
            return;
        }

        const textLength = node.text.length as number;
        const isInsideTextNode = from >= pos && from <= pos + textLength;
        if (!isInsideTextNode || !isInsideTaskItem(state.doc, pos)) {
            return;
        }

        const localOffset = from - pos;
        const textBeforeCursor = node.text.slice(0, localOffset);
        const helperMatch = /(?:^|\s)(>>?)([a-zA-Z]+)$/.exec(textBeforeCursor);
        if (!helperMatch) {
            return;
        }

        const prefix = helperMatch[1] as '>' | '>>';
        const typed = helperMatch[2];
        const tokenText = `${prefix}${typed}`;

        token = {
            from: from - tokenText.length,
            to: from,
            prefix,
            typed,
        };
    });

    return token;
}

function tokenIsActive(
    token: TaskToken,
    absolutePos: number,
    selectionFrom: number,
    selectionTo: number,
): boolean {
    const start = absolutePos + token.start;
    const end = absolutePos + token.end;

    if (selectionFrom === selectionTo) {
        return selectionFrom >= start && selectionFrom <= end;
    }

    return selectionFrom <= end && selectionTo >= start;
}

function buildTokenDecorations(
    doc: any,
    selectionFrom: number,
    selectionTo: number,
    localeTag: string,
): DecorationSet {
    const decorations: Decoration[] = [];
    let hasGhostSuggestion = false;

    doc.descendants((node: any, pos: number) => {
        if (!node.isText || !node.text || !isInsideTaskItem(doc, pos)) {
            return;
        }

        const text = node.text as string;
        const tokens = parseTaskTokens(text);

        for (const token of tokens) {
            const start = pos + token.start;
            const end = pos + token.end;
            const isActive = tokenIsActive(
                token,
                pos,
                selectionFrom,
                selectionTo,
            );
            const lowerValue = token.value.toLowerCase();
            const isTodayToken = lowerValue === 'today';
            const resolvedIso = isValidIsoDate(token.value)
                ? token.value
                : resolveDateKeyword(token.value, new Date());
            const className =
                token.prefix === '>>'
                    ? 'md-task-deadline-token'
                    : 'md-task-due-token';

            if (isTodayToken || !resolvedIso || isActive) {
                decorations.push(
                    Decoration.inline(start, end, {
                        class: className,
                    }),
                );
                continue;
            }

            const formatted = formatLocalizedDate(resolvedIso, localeTag);

            decorations.push(
                Decoration.inline(start, end, {
                    class: `${className} md-task-token-hidden`,
                }),
            );
            decorations.push(
                Decoration.widget(
                    end,
                    () => {
                        const span = document.createElement('span');
                        span.className = `${className} md-task-date-display`;
                        span.textContent = `${token.prefix}${formatted}`;

                        return span;
                    },
                    { side: -1 },
                ),
            );
        }

        if (hasGhostSuggestion || selectionFrom !== selectionTo) {
            return;
        }

        const caretInsideNode =
            selectionFrom >= pos && selectionFrom <= pos + text.length;
        if (!caretInsideNode) {
            return;
        }

        const localOffset = selectionFrom - pos;
        const textBeforeCursor = text.slice(0, localOffset);
        const suffix = findHelperSuggestion(textBeforeCursor);
        if (!suffix) {
            return;
        }

        decorations.push(
            Decoration.widget(
                selectionFrom,
                () => {
                    const ghost = document.createElement('span');
                    ghost.className = 'inline-command-ghost md-task-date-ghost';
                    ghost.textContent = suffix;

                    return ghost;
                },
                { side: 1 },
            ),
        );
        hasGhostSuggestion = true;
    });

    return DecorationSet.create(doc, decorations);
}

export const TaskItemWithDates = TaskItem.extend({
    addOptions() {
        const parentOptions = this.parent?.();

        return {
            ...(parentOptions ?? {}),
            nested: parentOptions?.nested ?? true,
            HTMLAttributes: parentOptions?.HTMLAttributes ?? {},
            taskListTypeName: parentOptions?.taskListTypeName ?? 'taskList',
            displayLocale: 'nl-NL',
        };
    },

    addAttributes() {
        return {
            ...(this.parent?.() ?? {}),
            id: {
                default: null,
                parseHTML: (element: HTMLElement) =>
                    element.getAttribute('data-id') ?? element.id ?? null,
                renderHTML: (attributes: { id?: string | null }) => {
                    const value = attributes.id?.trim();
                    if (!value) {
                        return {};
                    }

                    return {
                        id: value,
                        'data-id': value,
                    };
                },
            },
            priority: {
                default: null,
                parseHTML: (element: HTMLElement) =>
                    element.getAttribute('data-priority'),
                renderHTML: (attributes: { priority?: string | null }) =>
                    attributes.priority
                        ? { 'data-priority': attributes.priority }
                        : {},
            },
            taskStatus: {
                default: null,
                parseHTML: (element: HTMLElement) =>
                    element.getAttribute('data-task-status'),
                renderHTML: (attributes: { taskStatus?: string | null }) =>
                    attributes.taskStatus
                        ? { 'data-task-status': attributes.taskStatus }
                        : {},
            },
            backlogPromotedAt: {
                default: null,
                parseHTML: (element: HTMLElement) =>
                    element.getAttribute('data-backlog-promoted-at'),
                renderHTML: (attributes: { backlogPromotedAt?: string | null }) =>
                    attributes.backlogPromotedAt
                        ? { 'data-backlog-promoted-at': attributes.backlogPromotedAt }
                        : {},
            },
            canceledAt: {
                default: null,
                parseHTML: (element: HTMLElement) =>
                    element.getAttribute('data-canceled-at'),
                renderHTML: (attributes: { canceledAt?: string | null }) =>
                    attributes.canceledAt
                        ? { 'data-canceled-at': attributes.canceledAt }
                        : {},
            },
            completedAt: {
                default: null,
                parseHTML: (element: HTMLElement) =>
                    element.getAttribute('data-completed-at'),
                renderHTML: (attributes: { completedAt?: string | null }) =>
                    attributes.completedAt
                        ? { 'data-completed-at': attributes.completedAt }
                        : {},
            },
            startedAt: {
                default: null,
                parseHTML: (element: HTMLElement) =>
                    element.getAttribute('data-started-at'),
                renderHTML: (attributes: { startedAt?: string | null }) =>
                    attributes.startedAt
                        ? { 'data-started-at': attributes.startedAt }
                        : {},
            },
            migratedToNoteId: {
                default: null,
                parseHTML: (element: HTMLElement) =>
                    element.getAttribute('data-migrated-to-note-id'),
                renderHTML: (attributes: {
                    migratedToNoteId?: string | null;
                }) =>
                    attributes.migratedToNoteId
                        ? { 'data-migrated-to-note-id': attributes.migratedToNoteId }
                        : {},
            },
            migratedFromNoteId: {
                default: null,
                parseHTML: (element: HTMLElement) =>
                    element.getAttribute('data-migrated-from-note-id'),
                renderHTML: (attributes: {
                    migratedFromNoteId?: string | null;
                }) =>
                    attributes.migratedFromNoteId
                        ? { 'data-migrated-from-note-id': attributes.migratedFromNoteId }
                        : {},
            },
            migratedFromBlockId: {
                default: null,
                parseHTML: (element: HTMLElement) =>
                    element.getAttribute('data-migrated-from-block-id'),
                renderHTML: (attributes: {
                    migratedFromBlockId?: string | null;
                }) =>
                    attributes.migratedFromBlockId
                        ? { 'data-migrated-from-block-id': attributes.migratedFromBlockId }
                        : {},
            },
            dueDate: {
                default: null,
                parseHTML: (element: HTMLElement) =>
                    element.getAttribute('data-due-date'),
                renderHTML: (attributes: { dueDate?: string | null }) =>
                    attributes.dueDate
                        ? { 'data-due-date': attributes.dueDate }
                        : {},
            },
            dueDateMode: {
                default: null,
                parseHTML: (element: HTMLElement) =>
                    element.getAttribute('data-due-date-mode'),
                renderHTML: (attributes: { dueDateMode?: string | null }) =>
                    attributes.dueDateMode
                        ? { 'data-due-date-mode': attributes.dueDateMode }
                        : {},
            },
            deadlineDate: {
                default: null,
                parseHTML: (element: HTMLElement) =>
                    element.getAttribute('data-deadline-date'),
                renderHTML: (attributes: { deadlineDate?: string | null }) =>
                    attributes.deadlineDate
                        ? { 'data-deadline-date': attributes.deadlineDate }
                        : {},
            },
            deadlineDateMode: {
                default: null,
                parseHTML: (element: HTMLElement) =>
                    element.getAttribute('data-deadline-date-mode'),
                renderHTML: (attributes: {
                    deadlineDateMode?: string | null;
                }) =>
                    attributes.deadlineDateMode
                        ? {
                              'data-deadline-date-mode':
                                  attributes.deadlineDateMode,
                          }
                        : {},
            },
        };
    },

    addProseMirrorPlugins() {
        const parentPlugins = this.parent?.() ?? [];

        const syncDatesPlugin = new Plugin({
            appendTransaction: (transactions, oldState, newState) => {
                if (
                    !transactions.some((transaction) => transaction.docChanged)
                ) {
                    return null;
                }

                if (oldState.doc.eq(newState.doc)) {
                    return null;
                }

                const { tr } = newState;
                let hasChanges = false;

                const replacements: Array<{
                    from: number;
                    to: number;
                    replacement: string;
                }> = [];

                newState.doc.descendants((node, pos) => {
                    if (
                        !node.isText ||
                        !node.text ||
                        !isInsideTaskItem(newState.doc, pos)
                    ) {
                        return;
                    }

                    const text = node.text as string;
                    const now = new Date();

                    for (const token of parseTaskTokens(text)) {
                        const lowerValue = token.value.toLowerCase();
                        if (
                            lowerValue === 'today' ||
                            isValidIsoDate(token.value)
                        ) {
                            continue;
                        }

                        const resolved = resolveDateKeyword(token.value, now);
                        if (!resolved) {
                            continue;
                        }

                        replacements.push({
                            from: pos + token.start,
                            to: pos + token.end,
                            replacement: `${token.prefix}${resolved}`,
                        });
                    }
                });

                replacements
                    .sort((a, b) => b.from - a.from)
                    .forEach((replacement) => {
                        tr.insertText(
                            replacement.replacement,
                            replacement.from,
                            replacement.to,
                        );
                        hasChanges = true;
                    });

                const docAfterReplacements = hasChanges ? tr.doc : newState.doc;

                docAfterReplacements.descendants((node, pos) => {
                    if (node.type.name !== 'taskItem') {
                        return;
                    }

                    const lineText = getTaskItemLineText(node);
                    const parsed = parseTaskDates(lineText);

                    const currentDueDate = (node.attrs.dueDate ?? null) as
                        | string
                        | null;
                    const currentDueDateMode = (node.attrs.dueDateMode ??
                        null) as string | null;
                    const currentDeadlineDate = (node.attrs.deadlineDate ??
                        null) as string | null;
                    const currentDeadlineDateMode = (node.attrs
                        .deadlineDateMode ?? null) as string | null;

                    if (
                        currentDueDate === parsed.dueDate &&
                        currentDueDateMode === parsed.dueDateMode &&
                        currentDeadlineDate === parsed.deadlineDate &&
                        currentDeadlineDateMode === parsed.deadlineDateMode
                    ) {
                        return;
                    }

                    tr.setNodeMarkup(pos, undefined, {
                        ...node.attrs,
                        dueDate: parsed.dueDate,
                        dueDateMode: parsed.dueDateMode,
                        deadlineDate: parsed.deadlineDate,
                        deadlineDateMode: parsed.deadlineDateMode,
                    });
                    hasChanges = true;
                });

                return hasChanges ? tr : null;
            },
        });

        const tokenDecorationsPlugin = new Plugin({
            state: {
                init: (_, state) =>
                    buildTokenDecorations(
                        state.doc,
                        state.selection.from,
                        state.selection.to,
                        this.options.displayLocale,
                    ),
                apply: (tr, decorationSet) => {
                    if (!tr.docChanged && !tr.selectionSet) {
                        return decorationSet.map(tr.mapping, tr.doc);
                    }

                    return buildTokenDecorations(
                        tr.doc,
                        tr.selection.from,
                        tr.selection.to,
                        this.options.displayLocale,
                    );
                },
            },
            props: {
                decorations(state) {
                    return this.getState(state);
                },
                handleKeyDown(view, event) {
                    if (event.key !== ' ') {
                        return false;
                    }

                    const token = getHelperTokenAtSelection(view.state);
                    if (!token) {
                        return false;
                    }

                    const typedLower = token.typed.toLowerCase();
                    const suffix = getHelperCompletionAtSelection(view.state);
                    const completedKeyword = suffix
                        ? `${typedLower}${suffix}`
                        : typedLower;
                    const resolved = resolveDateKeyword(
                        completedKeyword,
                        new Date(),
                    );

                    event.preventDefault();

                    if (completedKeyword !== 'today' && resolved) {
                        view.dispatch(
                            view.state.tr.insertText(
                                `${token.prefix}${resolved} `,
                                token.from,
                                token.to,
                            ),
                        );

                        return true;
                    }

                    if (!suffix) {
                        return false;
                    }

                    view.dispatch(
                        view.state.tr.insertText(
                            `${token.prefix}${completedKeyword} `,
                            token.from,
                            token.to,
                        ),
                    );

                    return true;
                },
            },
        });

        return [...parentPlugins, syncDatesPlugin, tokenDecorationsPlugin];
    },
});
