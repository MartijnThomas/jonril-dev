import { TextSelection } from '@tiptap/pm/state';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';

export type BlockTreeDoc = {
    type: 'doc';
    content: Array<Record<string, unknown>>;
};

export type BlockParagraphStyle =
    | 'paragraph'
    | 'bullet'
    | 'quote'
    | 'ordered'
    | 'task'
    | 'checklist';
export type BlockTaskStatus =
    | 'backlog'
    | 'in_progress'
    | 'canceled'
    | 'migrated'
    | 'starred'
    | 'assigned'
    | 'deferred'
    | null;
export type BlockParagraphAttrs = Record<string, unknown> & {
    indent: number;
    blockStyle: BlockParagraphStyle;
    order: number;
    checked: boolean;
    taskStatus: BlockTaskStatus;
    assignee: string | null;
    dueDate: string | null;
    deadlineDate: string | null;
    startedAt: string | null;
    completedAt: string | null;
    canceledAt: string | null;
    backlogPromotedAt: string | null;
    migratedAt: string | null;
    migratedToNoteId: string | null;
    migratedFromNoteId: string | null;
    migratedFromBlockId: string | null;
};

type Dispatch = ((transaction: Transaction) => void) | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeNullableTimestamp(value: unknown): string | null {
    return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function normalizeNullableIsoDate(value: unknown): string | null {
    return typeof value === 'string' && isValidIsoDate(value) ? value : null;
}

function normalizeNullableIdentifier(value: unknown): string | null {
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function nowIsoTimestamp(): string {
    return new Date().toISOString();
}

export function normalizeTaskStatus(value: unknown): BlockTaskStatus {
    if (
        value === 'backlog' ||
        value === 'in_progress' ||
        value === 'canceled' ||
        value === 'migrated' ||
        value === 'starred' ||
        value === 'assigned' ||
        value === 'deferred'
    ) {
        return value;
    }

    return null;
}

export function taskStatusToken(status: BlockTaskStatus): string {
    if (status === 'backlog') {
        return '?';
    }

    if (status === 'in_progress') {
        return '/';
    }

    if (status === 'canceled') {
        return '-';
    }

    if (status === 'starred') {
        return '*';
    }

    if (status === 'deferred') {
        return '<';
    }

    return '';
}

export function taskStatusTextPrefix(status: BlockTaskStatus): '? ' | '/ ' | '- ' | '* ' | '< ' | '' {
    if (status === 'backlog') {
        return '? ';
    }

    if (status === 'in_progress') {
        return '/ ';
    }

    if (status === 'canceled') {
        return '- ';
    }

    if (status === 'starred') {
        return '* ';
    }

    if (status === 'deferred') {
        return '< ';
    }

    return '';
}

export function detectTaskStatusFromTextPrefix(text: string): BlockTaskStatus {
    if (/^\?\s/u.test(text)) {
        return 'backlog';
    }

    if (/^\/\s/u.test(text)) {
        return 'in_progress';
    }

    if (/^(?:-|—)\s/u.test(text)) {
        return 'canceled';
    }

    if (/^\*\s/u.test(text)) {
        return 'starred';
    }

    if (/^<\s/u.test(text)) {
        return 'deferred';
    }

    return null;
}

function isAssignedTaskText(text: string): boolean {
    return /^(?:[?/*<\-—]\s)?(?:!{1,3}\s)?@[^\s]+/u.test(text);
}

function detectAssignedTaskAssignee(text: string): string | null {
    const match = text.match(/^(?:[?/*<\-—]\s)?(?:!{1,3}\s)?@([^\s]+)/u);
    const assignee = (match?.[1] ?? '').trim();

    return assignee !== '' ? assignee : null;
}

function detectFirstTaskMentionAssignee(text: string): string | null {
    const match = text.match(/@([^\s]+)/u);
    const assignee = (match?.[1] ?? '').trim();

    return assignee !== '' ? assignee : null;
}

type ParsedTaskDates = {
    dueDate: string | null;
    deadlineDate: string | null;
};

export type BlockTaskDateToken = {
    prefix: '>' | '>>';
    value: string;
    start: number;
    end: number;
};

export type BlockTaskPriority = 'normal' | 'medium' | 'high' | null;

const BLOCK_TASK_DATE_TOKEN_REGEX =
    /(>>?)(\d{4}-\d{2}-\d{2}|\d{4}-[Ww]\d{1,2}|\d{4}-\d{1,2})/g;
const BLOCK_TASK_PRIORITY_REGEX = /^(?:[?/*<\-—]\s)?(!{1,3})(?=\s|$)/u;

export function headingTextPrefix(level: number): string {
    return `${'#'.repeat(Math.min(6, Math.max(1, level)))} `;
}

export function detectHeadingLevelFromTextPrefix(text: string): number | null {
    const match = text.match(/^(#{1,6})\s/u);

    if (!match) {
        return null;
    }

    return match[1].length;
}

export function sanitizeIndent(value: unknown): number {
    const numeric = Number(value ?? 0);

    if (!Number.isFinite(numeric)) {
        return 0;
    }

    return Math.max(0, Math.floor(numeric));
}

export function isValidIsoDate(value: string): boolean {
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

function isValidIsoWeek(value: string): boolean {
    const match = /^(?<year>\d{4})-[Ww](?<week>\d{1,2})$/.exec(value);
    if (!match?.groups) {
        return false;
    }

    const week = Number(match.groups.week);

    return week >= 1 && week <= 53;
}

function isValidIsoMonth(value: string): boolean {
    const match = /^(?<year>\d{4})-(?<month>\d{1,2})$/.exec(value);
    if (!match?.groups) {
        return false;
    }

    const month = Number(match.groups.month);

    return month >= 1 && month <= 12;
}

function isSupportedTaskDateToken(value: string): boolean {
    return (
        isValidIsoDate(value) || isValidIsoWeek(value) || isValidIsoMonth(value)
    );
}

export function parseBlockTaskDateTokens(text: string): BlockTaskDateToken[] {
    const tokens: BlockTaskDateToken[] = [];

    for (const match of text.matchAll(BLOCK_TASK_DATE_TOKEN_REGEX)) {
        const raw = match[0];
        const prefix = match[1] as '>' | '>>';
        const value = match[2];
        const start = match.index ?? -1;

        if (start < 0 || !isSupportedTaskDateToken(value)) {
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

export function parseBlockTaskDates(text: string): ParsedTaskDates {
    let dueDate: string | null = null;
    let deadlineDate: string | null = null;

    for (const token of parseBlockTaskDateTokens(text)) {
        if (!isValidIsoDate(token.value)) {
            continue;
        }

        if (token.prefix === '>>') {
            deadlineDate = token.value;
        } else {
            dueDate = token.value;
        }
    }

    return { dueDate, deadlineDate };
}

export function formatLocalizedDate(
    dateToken: string,
    localeTag: string,
): string {
    if (isValidIsoDate(dateToken)) {
        const date = new Date(`${dateToken}T00:00:00`);

        return new Intl.DateTimeFormat(localeTag, {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        }).format(date);
    }

    const weekMatch = /^(?<year>\d{4})-[Ww](?<week>\d{1,2})$/.exec(dateToken);
    if (weekMatch?.groups) {
        const week = Number(weekMatch.groups.week);
        const year = Number(weekMatch.groups.year);
        if (week >= 1 && week <= 53) {
            return `Week ${week} (${year})`;
        }
    }

    if (isValidIsoMonth(dateToken)) {
        const monthMatch = /^(?<year>\d{4})-(?<month>\d{1,2})$/.exec(dateToken);
        if (!monthMatch?.groups) {
            return dateToken;
        }
        const month = Number(monthMatch.groups.month);
        const year = Number(monthMatch.groups.year);
        const date = new Date(
            `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01T00:00:00`,
        );

        return new Intl.DateTimeFormat(localeTag, {
            month: 'long',
            year: 'numeric',
        }).format(date);
    }

    return dateToken;
}

export function parseBlockTaskPriority(
    text: string,
): { priority: Exclude<BlockTaskPriority, null>; tokenStart: number; tokenEnd: number } | null {
    const match = BLOCK_TASK_PRIORITY_REGEX.exec(text);

    if (!match) {
        return null;
    }

    const fullMatch = match[0] ?? '';
    const token = match[1] ?? '';
    const tokenStart = fullMatch.length - token.length;
    const tokenEnd = tokenStart + token.length;

    if (token === '!!!') {
        return {
            priority: 'high',
            tokenStart,
            tokenEnd,
        };
    }

    if (token === '!!') {
        return {
            priority: 'medium',
            tokenStart,
            tokenEnd,
        };
    }

    return {
        priority: 'normal',
        tokenStart,
        tokenEnd,
    };
}

export function normalizeParagraphAttrs(attrs: unknown): BlockParagraphAttrs {
    const raw = isRecord(attrs) ? attrs : {};
    const blockStyle = raw.blockStyle === 'bullet'
        ? 'bullet'
        : raw.blockStyle === 'quote'
            ? 'quote'
            : raw.blockStyle === 'ordered'
                ? 'ordered'
                : raw.blockStyle === 'task'
                    ? 'task'
                    : raw.blockStyle === 'checklist'
                        ? 'checklist'
                        : 'paragraph';
    const order = Math.max(1, Math.floor(Number(raw.order ?? 1) || 1));
    const checked = raw.checked === true;
    const taskStatus = normalizeTaskStatus(raw.taskStatus);
    const assignee = normalizeNullableIdentifier(raw.assignee);
    const dueDate = normalizeNullableIsoDate(raw.dueDate);
    const deadlineDate = normalizeNullableIsoDate(raw.deadlineDate);
    const startedAt = normalizeNullableTimestamp(raw.startedAt);
    const completedAt = normalizeNullableTimestamp(raw.completedAt);
    const canceledAt = normalizeNullableTimestamp(raw.canceledAt);
    const backlogPromotedAt = normalizeNullableTimestamp(raw.backlogPromotedAt);
    const migratedAt = normalizeNullableTimestamp(raw.migratedAt);
    const migratedToNoteId = normalizeNullableIdentifier(raw.migratedToNoteId);
    const migratedFromNoteId = normalizeNullableIdentifier(raw.migratedFromNoteId);
    const migratedFromBlockId = normalizeNullableIdentifier(raw.migratedFromBlockId);

    return {
        ...raw,
        indent: sanitizeIndent(raw.indent),
        blockStyle,
        order,
        checked,
        taskStatus,
        assignee,
        dueDate,
        deadlineDate,
        startedAt,
        completedAt,
        canceledAt,
        backlogPromotedAt,
        migratedAt,
        migratedToNoteId,
        migratedFromNoteId,
        migratedFromBlockId,
    };
}

export function normalizeHeadingAttrs(attrs: unknown): Record<string, unknown> {
    const raw = isRecord(attrs) ? attrs : {};
    const level = Math.min(6, Math.max(1, Math.floor(Number(raw.level ?? 1) || 1)));

    return {
        ...raw,
        level,
    };
}

export function createEmptyBlockDocument(): BlockTreeDoc {
    return {
        type: 'doc',
        content: [
            {
                type: 'paragraph',
                attrs: normalizeParagraphAttrs({}),
            },
        ],
    };
}

export function isBlockTreeDocument(content: unknown): content is BlockTreeDoc {
    if (!isRecord(content) || content.type !== 'doc' || !Array.isArray(content.content)) {
        return false;
    }

    return content.content.every((entry) => {
        if (!isRecord(entry) || typeof entry.type !== 'string') {
            return false;
        }

        return entry.type === 'heading' || entry.type === 'paragraph';
    });
}

export function isBlockTreeSchema(editor: Editor | null): boolean {
    return Boolean(editor?.schema.nodes.paragraph?.spec.attrs?.indent);
}

export function getCurrentBlockNodeFromState(state: EditorState): {
    type: string;
    pos: number;
    node: { attrs: Record<string, unknown>; nodeSize: number };
} | null {
    const { $from } = state.selection;

    for (let depth = $from.depth; depth > 0; depth -= 1) {
        const node = $from.node(depth);
        if (node.type.name !== 'paragraph' && node.type.name !== 'heading' && node.type.name !== 'codeBlock') {
            continue;
        }

        return {
            type: node.type.name,
            pos: $from.before(depth),
            node: {
                attrs: isRecord(node.attrs) ? (node.attrs as Record<string, unknown>) : {},
                nodeSize: node.nodeSize,
            },
        };
    }

    return null;
}

export function getCurrentBlockNode(editor: Editor): {
    type: string;
    pos: number;
    node: { attrs: Record<string, unknown>; nodeSize: number };
} | null {
    return getCurrentBlockNodeFromState(editor.state);
}

function dispatchParagraphAttrsUpdate(
    state: EditorState,
    dispatch: Dispatch,
    pos: number,
    attrs: Record<string, unknown>,
): boolean {
    if (!dispatch) {
        return true;
    }

    dispatch(state.tr.setNodeMarkup(pos, undefined, attrs));

    return true;
}

function updateTaskStatusTextPrefixInTransaction(
    transaction: Transaction,
    pos: number,
    nextPrefix: string,
): Transaction {
    const currentNode = transaction.doc.nodeAt(pos);
    if (!currentNode || currentNode.type.name !== 'paragraph') {
        return transaction;
    }

    const textContent = currentNode.textContent;
    const currentPrefixLength = textContent.match(/^(?:\?|\/|-|\*|<)\s/u)?.[0].length ?? 0;
    const contentStart = pos + 1;

    if (currentPrefixLength > 0) {
        transaction = transaction.delete(contentStart, contentStart + currentPrefixLength);
    }

    if (nextPrefix !== '') {
        transaction = transaction.insertText(nextPrefix, contentStart);
    }

    return transaction;
}

function updateHeadingTextPrefixInTransaction(
    transaction: Transaction,
    pos: number,
    nextLevel: number | null,
): Transaction {
    const currentNode = transaction.doc.nodeAt(pos);
    if (!currentNode) {
        return transaction;
    }

    const isHeading = currentNode.type.name === 'heading';
    const isParagraphStrip = nextLevel === null && currentNode.type.name === 'paragraph';

    if (!isHeading && !isParagraphStrip) {
        return transaction;
    }

    const textContent = currentNode.textContent;
    const currentPrefixLength = textContent.match(/^(#{1,6}\s)/u)?.[0].length ?? 0;
    const contentStart = pos + 1;

    if (currentPrefixLength > 0) {
        transaction = transaction.delete(contentStart, contentStart + currentPrefixLength);
    }

    if (nextLevel !== null) {
        transaction = transaction.insertText(headingTextPrefix(nextLevel), contentStart);
    }

    return transaction;
}

export function indentCurrentParagraph(
    editor: Editor,
    state: EditorState = editor.state,
    dispatch: Dispatch = editor.view.dispatch,
): boolean {
    const current = getCurrentBlockNodeFromState(state);
    if (!current || current.type !== 'paragraph') {
        return false;
    }

    const attrs = normalizeParagraphAttrs(current.node.attrs);

    return dispatchParagraphAttrsUpdate(state, dispatch, current.pos, {
        ...attrs,
        indent: sanitizeIndent(attrs.indent) + 1,
    });
}

export function setCurrentParagraphStyle(
    editor: Editor,
    blockStyle: BlockParagraphStyle,
    options?: { order?: number; checked?: boolean; taskStatus?: BlockTaskStatus },
    state: EditorState = editor.state,
    dispatch: Dispatch = editor.view.dispatch,
): boolean {
    const current = getCurrentBlockNodeFromState(state);
    if (!current || current.type !== 'paragraph') {
        return false;
    }

    const attrs = normalizeParagraphAttrs(current.node.attrs);

    return dispatchParagraphAttrsUpdate(state, dispatch, current.pos, {
        ...attrs,
        blockStyle,
        order:
            blockStyle === 'ordered'
                ? Math.max(1, Math.floor(Number(options?.order ?? attrs.order ?? 1) || 1))
                : 1,
        checked:
            blockStyle === 'task' || blockStyle === 'checklist'
                ? options?.checked ?? attrs.checked === true
                : false,
        taskStatus:
            blockStyle === 'task'
                ? normalizeTaskStatus(options?.taskStatus ?? attrs.taskStatus)
                : null,
        assignee: blockStyle === 'task' ? attrs.assignee : null,
        dueDate: blockStyle === 'task' ? attrs.dueDate : null,
        deadlineDate: blockStyle === 'task' ? attrs.deadlineDate : null,
        startedAt: blockStyle === 'task' ? attrs.startedAt : null,
        completedAt: blockStyle === 'task' ? attrs.completedAt : null,
        canceledAt: blockStyle === 'task' ? attrs.canceledAt : null,
        backlogPromotedAt: blockStyle === 'task' ? attrs.backlogPromotedAt : null,
    });
}

export function setParagraphCheckedAtPos(
    editor: Editor,
    pos: number,
    checked: boolean,
    state: EditorState = editor.state,
    dispatch: Dispatch = editor.view.dispatch,
): boolean {
    const node = state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'paragraph') {
        return false;
    }

    const attrs = normalizeParagraphAttrs(node.attrs);
    if (attrs.blockStyle !== 'task' && attrs.blockStyle !== 'checklist') {
        return false;
    }

    return dispatchParagraphAttrsUpdate(state, dispatch, pos, {
        ...attrs,
        checked,
        completedAt:
            attrs.blockStyle === 'task'
                ? (checked ? nowIsoTimestamp() : null)
                : null,
    });
}

export function toggleParagraphTaskAtPos(
    editor: Editor,
    pos: number,
    state: EditorState = editor.state,
    dispatch: Dispatch = editor.view.dispatch,
): boolean {
    const node = state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'paragraph') {
        return false;
    }

    const attrs = normalizeParagraphAttrs(node.attrs);
    if (attrs.blockStyle !== 'task') {
        return false;
    }

    if (!dispatch) {
        return true;
    }

    const timestamp = nowIsoTimestamp();

    if (attrs.taskStatus === 'backlog' && attrs.checked !== true) {
        let transaction = state.tr.setNodeMarkup(pos, undefined, {
            ...attrs,
            taskStatus: null,
            assignee: null,
            checked: false,
            completedAt: null,
            canceledAt: null,
            backlogPromotedAt: timestamp,
        });

        transaction = updateTaskStatusTextPrefixInTransaction(transaction, pos, '');

        dispatch(transaction);

        return true;
    }

    if (attrs.taskStatus === 'in_progress' && attrs.checked !== true) {
        let transaction = state.tr.setNodeMarkup(pos, undefined, {
            ...attrs,
            taskStatus: null,
            assignee: null,
            checked: true,
            completedAt: timestamp,
            canceledAt: null,
        });

        transaction = updateTaskStatusTextPrefixInTransaction(transaction, pos, '');

        dispatch(transaction);

        return true;
    }

    if (attrs.checked === true) {
        let transaction = state.tr.setNodeMarkup(pos, undefined, {
            ...attrs,
            checked: false,
            taskStatus: null,
            assignee: null,
            completedAt: null,
            canceledAt: null,
        });

        transaction = updateTaskStatusTextPrefixInTransaction(transaction, pos, '');

        dispatch(transaction);

        return true;
    }

    let transaction = state.tr.setNodeMarkup(pos, undefined, {
        ...attrs,
        checked: true,
        taskStatus: null,
        assignee: null,
        completedAt: timestamp,
        canceledAt: null,
    });

    transaction = updateTaskStatusTextPrefixInTransaction(transaction, pos, '');

    dispatch(transaction);

    return true;
}

export function setParagraphTaskStatusAtPos(
    editor: Editor,
    pos: number,
    taskStatus: BlockTaskStatus,
    state: EditorState = editor.state,
    dispatch: Dispatch = editor.view.dispatch,
): boolean {
    const node = state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'paragraph') {
        return false;
    }

    const attrs = normalizeParagraphAttrs(node.attrs);
    if (attrs.blockStyle !== 'task') {
        return false;
    }

    if (!dispatch) {
        return true;
    }

    const normalizedTaskStatus = normalizeTaskStatus(taskStatus);
    const timestamp = nowIsoTimestamp();
    const assignee = normalizedTaskStatus === 'assigned'
        ? detectFirstTaskMentionAssignee(node.textContent)
        : null;

    const nextChecked = normalizedTaskStatus === null ? attrs.checked === true : false;
    const nextCompletedAt = nextChecked
        ? (attrs.completedAt ?? timestamp)
        : null;
    const nextCanceledAt = normalizedTaskStatus === 'canceled'
        ? (attrs.canceledAt ?? timestamp)
        : null;

    let transaction = state.tr.setNodeMarkup(pos, undefined, {
        ...attrs,
        taskStatus: normalizedTaskStatus,
        assignee,
        checked: nextChecked,
        startedAt:
            normalizedTaskStatus === 'in_progress' && attrs.taskStatus !== 'in_progress'
                ? timestamp
                : attrs.startedAt,
        completedAt: nextCompletedAt,
        canceledAt: nextCanceledAt,
        backlogPromotedAt:
            normalizedTaskStatus === 'backlog'
                ? null
                : attrs.backlogPromotedAt,
    });

    transaction = updateTaskStatusTextPrefixInTransaction(
        transaction,
        pos,
        taskStatusTextPrefix(normalizedTaskStatus),
    );

    dispatch(transaction);

    return true;
}

export function getParagraphMarkerBounds(element: HTMLElement): {
    left: number;
    right: number;
} {
    const rect = element.getBoundingClientRect();
    const paddingLeft = Number.parseFloat(window.getComputedStyle(element).paddingLeft || '0');
    const markerWidth = 18;
    const markerGapToText = 6;
    const right = rect.left + Math.max(0, paddingLeft - markerGapToText);
    const left = Math.max(rect.left, right - markerWidth);

    return {
        left,
        right,
    };
}

export function setCurrentParagraphChecked(
    editor: Editor,
    checked: boolean,
    state: EditorState = editor.state,
    dispatch: Dispatch = editor.view.dispatch,
): boolean {
    const current = getCurrentBlockNodeFromState(state);
    if (!current || current.type !== 'paragraph') {
        return false;
    }

    return setParagraphCheckedAtPos(editor, current.pos, checked, state, dispatch);
}

export function increaseCurrentHeadingLevel(
    editor: Editor,
    state: EditorState = editor.state,
    dispatch: Dispatch = editor.view.dispatch,
): boolean {
    const current = getCurrentBlockNodeFromState(state);
    if (!current || current.type !== 'heading') {
        return false;
    }

    const attrs = normalizeHeadingAttrs(current.node.attrs);
    const currentLevel = Number(attrs.level ?? 1);

    if (currentLevel >= 6) {
        return true;
    }

    if (!dispatch) {
        return true;
    }

    const transaction = state.tr.setNodeMarkup(current.pos, undefined, {
        ...attrs,
        level: currentLevel + 1,
    });

    dispatch(transaction);

    return true;
}

export function decreaseCurrentHeadingLevel(
    editor: Editor,
    state: EditorState = editor.state,
    dispatch: Dispatch = editor.view.dispatch,
): boolean {
    const current = getCurrentBlockNodeFromState(state);
    if (!current || current.type !== 'heading') {
        return false;
    }

    const attrs = normalizeHeadingAttrs(current.node.attrs);
    const currentLevel = Number(attrs.level ?? 1);

    if (currentLevel <= 1) {
        if (!dispatch) {
            return true;
        }

        dispatch(state.tr.setNodeMarkup(
            current.pos,
            editor.schema.nodes.paragraph,
            normalizeParagraphAttrs({}),
        ));

        return true;
    }

    if (!dispatch) {
        return true;
    }

    dispatch(state.tr.setNodeMarkup(current.pos, undefined, {
        ...attrs,
        level: currentLevel - 1,
    }));

    return true;
}

export function setCurrentHeadingLevel(
    editor: Editor,
    level: number,
    state: EditorState = editor.state,
    dispatch: Dispatch = editor.view.dispatch,
): boolean {
    const current = getCurrentBlockNodeFromState(state);
    if (!current) {
        return false;
    }

    const normalizedLevel = Math.min(6, Math.max(1, level));

    if (!dispatch) {
        return true;
    }

    dispatch(state.tr.setNodeMarkup(
        current.pos,
        editor.schema.nodes.heading,
        normalizeHeadingAttrs({ level: normalizedLevel }),
    ));

    return true;
}

export function convertCurrentHeadingToParagraph(
    editor: Editor,
    state: EditorState = editor.state,
    dispatch: Dispatch = editor.view.dispatch,
): boolean {
    const current = getCurrentBlockNodeFromState(state);
    if (!current || current.type !== 'heading') {
        return false;
    }

    if (!dispatch) {
        return true;
    }

    dispatch(state.tr.setNodeMarkup(
        current.pos,
        editor.schema.nodes.paragraph,
        normalizeParagraphAttrs({}),
    ));

    return true;
}

export function dedentCurrentParagraph(
    editor: Editor,
    state: EditorState = editor.state,
    dispatch: Dispatch = editor.view.dispatch,
): boolean {
    const current = getCurrentBlockNodeFromState(state);
    if (!current || current.type !== 'paragraph') {
        return false;
    }

    const attrs = normalizeParagraphAttrs(current.node.attrs);
    const currentIndent = sanitizeIndent(attrs.indent);

    if (currentIndent === 0) {
        if (
            attrs.blockStyle === 'bullet' ||
            attrs.blockStyle === 'ordered' ||
            attrs.blockStyle === 'task' ||
            attrs.blockStyle === 'checklist'
        ) {
            return setCurrentParagraphStyle(editor, 'paragraph', undefined, state, dispatch);
        }

        return false;
    }

    return dispatchParagraphAttrsUpdate(state, dispatch, current.pos, {
        ...attrs,
        indent: currentIndent - 1,
    });
}

export function removeParagraphStyleOrDedentCurrentParagraph(
    editor: Editor,
    state: EditorState = editor.state,
    dispatch: Dispatch = editor.view.dispatch,
): boolean {
    const current = getCurrentBlockNodeFromState(state);
    if (!current || current.type !== 'paragraph') {
        return false;
    }

    const attrs = normalizeParagraphAttrs(current.node.attrs);

    if (
        attrs.blockStyle === 'bullet' ||
        attrs.blockStyle === 'quote' ||
        attrs.blockStyle === 'ordered' ||
        attrs.blockStyle === 'task' ||
        attrs.blockStyle === 'checklist'
    ) {
        if (!dispatch) {
            return true;
        }

        let transaction = state.tr.setNodeMarkup(current.pos, undefined, {
            ...attrs,
            blockStyle: 'paragraph',
            order: 1,
            checked: false,
            taskStatus: null,
            assignee: null,
            dueDate: null,
            deadlineDate: null,
            startedAt: null,
            completedAt: null,
            canceledAt: null,
            backlogPromotedAt: null,
        });

        transaction = updateTaskStatusTextPrefixInTransaction(transaction, current.pos, '');

        dispatch(transaction);

        return true;
    }

    return dedentCurrentParagraph(editor, state, dispatch);
}

export function isAtStartOfCurrentBlock(editor: Editor): boolean {
    const current = getCurrentBlockNode(editor);
    if (!current) {
        return false;
    }

    const { from, to, $from } = editor.state.selection;
    if (from !== to) {
        return false;
    }

    return $from.parentOffset === 0;
}

export function isAtEndOfCurrentBlock(editor: Editor): boolean {
    const current = getCurrentBlockNode(editor);
    if (!current) {
        return false;
    }

    const { from, to, $from } = editor.state.selection;
    if (from !== to) {
        return false;
    }

    return $from.parentOffset === $from.parent.content.size;
}

export function syncTaskParagraphStatusesFromText(
    state: EditorState,
): Transaction | null {
    let transaction = state.tr;
    let changed = false;

    state.doc.descendants((node, pos) => {
        if (node.type.name !== 'paragraph') {
            return true;
        }

        const attrs = normalizeParagraphAttrs(node.attrs);
        if (attrs.blockStyle !== 'task') {
            return true;
        }

        const mappedPos = transaction.mapping.map(pos);
        const currentNode = transaction.doc.nodeAt(mappedPos);
        if (!currentNode || currentNode.type.name !== 'paragraph') {
            return true;
        }

        const currentAttrs = normalizeParagraphAttrs(currentNode.attrs);
        const inferredStatus = detectTaskStatusFromTextPrefix(currentNode.textContent);
        const inferredAssignee = detectAssignedTaskAssignee(currentNode.textContent);
        const firstMentionAssignee = detectFirstTaskMentionAssignee(currentNode.textContent);
        let nextStatus: BlockTaskStatus = inferredStatus;

        if (nextStatus === null && isAssignedTaskText(currentNode.textContent)) {
            nextStatus = 'assigned';
        }
        if (nextStatus === 'deferred' && detectAssignedTaskAssignee(currentNode.textContent) !== null) {
            nextStatus = 'assigned';
        }
        if (
            nextStatus === null &&
            currentAttrs.taskStatus === 'assigned' &&
            firstMentionAssignee !== null
        ) {
            nextStatus = 'assigned';
        }
        if (nextStatus === null && currentAttrs.taskStatus === 'deferred') {
            nextStatus = 'deferred';
        }
        const nextAssignee =
            nextStatus === 'assigned'
                ? (firstMentionAssignee ?? inferredAssignee ?? currentAttrs.assignee)
                : null;

        if (
            inferredStatus === null &&
            currentAttrs.taskStatus === 'migrated' &&
            currentAttrs.migratedToNoteId !== null
        ) {
            nextStatus = 'migrated';
        }
        const parsedDates = parseBlockTaskDates(currentNode.textContent);
        if (currentAttrs.taskStatus === nextStatus) {
            if (
                currentAttrs.dueDate === parsedDates.dueDate &&
                currentAttrs.deadlineDate === parsedDates.deadlineDate &&
                currentAttrs.assignee === nextAssignee
            ) {
                return true;
            }
        }

        const nextChecked = nextStatus === null || nextStatus === 'assigned' ? currentAttrs.checked === true : false;
        const nextCompletedAt = nextChecked
            ? (currentAttrs.completedAt ?? nowIsoTimestamp())
            : null;
        const nextCanceledAt =
            nextStatus === 'canceled'
                ? (currentAttrs.canceledAt ?? nowIsoTimestamp())
                : null;

        transaction = transaction.setNodeMarkup(mappedPos, undefined, {
            ...currentAttrs,
            taskStatus: nextStatus,
            assignee: nextAssignee,
            dueDate: parsedDates.dueDate,
            deadlineDate: parsedDates.deadlineDate,
            checked: nextChecked,
            startedAt:
                nextStatus === 'in_progress' && currentAttrs.taskStatus !== 'in_progress'
                    ? nowIsoTimestamp()
                    : currentAttrs.startedAt,
            completedAt: nextCompletedAt,
            canceledAt: nextCanceledAt,
            backlogPromotedAt:
                nextStatus === 'backlog'
                    ? null
                    : currentAttrs.backlogPromotedAt,
        });
        changed = true;

        return true;
    });

    if (!changed) {
        return null;
    }

    const { from, to } = state.selection;
    transaction = transaction.setSelection(
        TextSelection.create(
            transaction.doc,
            transaction.mapping.map(from),
            transaction.mapping.map(to),
        ),
    );

    return transaction;
}

export function syncHeadingBlocksFromText(
    editor: Editor,
    state: EditorState,
): Transaction | null {
    let transaction = state.tr;
    let changed = false;

    state.doc.descendants((node, pos) => {
        if (node.type.name === 'paragraph') {
            const attrs = normalizeParagraphAttrs(node.attrs);

            if (attrs.blockStyle !== 'paragraph') {
                return true;
            }

            const mappedPos = transaction.mapping.map(pos);
            const currentNode = transaction.doc.nodeAt(mappedPos);
            if (!currentNode || currentNode.type.name !== 'paragraph') {
                return true;
            }

            const detectedLevel = detectHeadingLevelFromTextPrefix(currentNode.textContent);
            if (detectedLevel === null) {
                return true;
            }

            transaction = transaction.setNodeMarkup(
                mappedPos,
                editor.schema.nodes.heading,
                normalizeHeadingAttrs({ level: detectedLevel }),
            );
            changed = true;

            return true;
        }

        if (node.type.name !== 'heading') {
            return true;
        }

        const mappedPos = transaction.mapping.map(pos);
        const currentNode = transaction.doc.nodeAt(mappedPos);
        if (!currentNode || currentNode.type.name !== 'heading') {
            return true;
        }

        const attrs = normalizeHeadingAttrs(currentNode.attrs);
        const detectedLevel = detectHeadingLevelFromTextPrefix(currentNode.textContent);

        if (detectedLevel === null) {
            transaction = updateHeadingTextPrefixInTransaction(
                transaction,
                mappedPos,
                Number(attrs.level ?? 1),
            );
            changed = true;
            return true;
        }

        if (attrs.level !== detectedLevel) {
            transaction = transaction.setNodeMarkup(mappedPos, undefined, {
                ...attrs,
                level: detectedLevel,
            });
            changed = true;
        }

        return true;
    });

    if (!changed) {
        return null;
    }

    const { from, to } = state.selection;
    transaction = transaction.setSelection(
        TextSelection.create(
            transaction.doc,
            transaction.mapping.map(from),
            transaction.mapping.map(to),
        ),
    );

    return transaction;
}

export function normalizeHeadingPrefixesFromAttrs(
    state: EditorState,
): Transaction | null {
    let transaction = state.tr;
    let changed = false;

    state.doc.descendants((node, pos) => {
        if (node.type.name !== 'heading') {
            return true;
        }

        const attrs = normalizeHeadingAttrs(node.attrs);
        const expectedPrefix = headingTextPrefix(Number(attrs.level ?? 1));
        if (node.textContent.startsWith(expectedPrefix)) {
            return true;
        }

        transaction = updateHeadingTextPrefixInTransaction(transaction, transaction.mapping.map(pos), Number(attrs.level ?? 1));
        changed = true;
        return true;
    });

    return changed ? transaction : null;
}

export function ensureFirstBlockHeadingLevelOne(
    editor: Editor,
    state: EditorState,
): Transaction | null {
    const firstNode = state.doc.firstChild;
    if (!firstNode) {
        return null;
    }

    if (firstNode.type.name === 'heading') {
        const attrs = normalizeHeadingAttrs(firstNode.attrs);
        if (Number(attrs.level ?? 1) === 1) {
            return null;
        }

        const transaction = state.tr.setNodeMarkup(0, undefined, {
            ...attrs,
            level: 1,
        });

        const { from, to } = state.selection;
        return transaction.setSelection(
            TextSelection.create(
                transaction.doc,
                transaction.mapping.map(from),
                transaction.mapping.map(to),
            ),
        );
    }

    if (firstNode.type.name !== 'paragraph') {
        return null;
    }

    const paragraphAttrs = normalizeParagraphAttrs(firstNode.attrs);

    if (paragraphAttrs.blockStyle !== 'paragraph') {
        return null;
    }

    const headingId =
        typeof paragraphAttrs.id === 'string' && paragraphAttrs.id.trim() !== ''
            ? paragraphAttrs.id.trim()
            : null;

    let transaction = state.tr.setNodeMarkup(
        0,
        editor.schema.nodes.heading,
        normalizeHeadingAttrs({
            id: headingId,
            level: 1,
        }),
    );

    const { from, to } = state.selection;
    transaction = transaction.setSelection(
        TextSelection.create(
            transaction.doc,
            transaction.mapping.map(from),
            transaction.mapping.map(to),
        ),
    );

    return transaction;
}
