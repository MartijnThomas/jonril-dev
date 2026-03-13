import { TextSelection } from '@tiptap/pm/state';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';

export type BlockTreeDoc = {
    type: 'doc';
    content: Array<Record<string, unknown>>;
};

export type BlockParagraphStyle = 'paragraph' | 'bullet' | 'quote' | 'ordered' | 'task';
export type BlockTaskStatus = 'backlog' | 'in_progress' | 'canceled' | null;
export type BlockParagraphAttrs = Record<string, unknown> & {
    indent: number;
    blockStyle: BlockParagraphStyle;
    order: number;
    checked: boolean;
    taskStatus: BlockTaskStatus;
    dueDate: string | null;
    deadlineDate: string | null;
    startedAt: string | null;
    completedAt: string | null;
    backlogPromotedAt: string | null;
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

function nowIsoTimestamp(): string {
    return new Date().toISOString();
}

export function normalizeTaskStatus(value: unknown): BlockTaskStatus {
    if (value === 'backlog' || value === 'in_progress' || value === 'canceled') {
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

    return '';
}

export function taskStatusTextPrefix(status: BlockTaskStatus): '? ' | '/ ' | '' {
    if (status === 'backlog') {
        return '? ';
    }

    if (status === 'in_progress') {
        return '/ ';
    }

    return '';
}

export function detectTaskStatusFromTextPrefix(text: string): BlockTaskStatus {
    if (text.startsWith('? ')) {
        return 'backlog';
    }

    if (text.startsWith('/ ')) {
        return 'in_progress';
    }

    return null;
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

const BLOCK_TASK_DATE_TOKEN_REGEX = /(>>?)(\d{4}-\d{2}-\d{2})/g;
const BLOCK_TASK_PRIORITY_REGEX = /^(?:[?/]\s)?(!{1,3})(?=\s|$)/u;

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

export function parseBlockTaskDateTokens(text: string): BlockTaskDateToken[] {
    const tokens: BlockTaskDateToken[] = [];

    for (const match of text.matchAll(BLOCK_TASK_DATE_TOKEN_REGEX)) {
        const raw = match[0];
        const prefix = match[1] as '>' | '>>';
        const value = match[2];
        const start = match.index ?? -1;

        if (start < 0 || !isValidIsoDate(value)) {
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
        if (token.prefix === '>>') {
            deadlineDate = token.value;
        } else {
            dueDate = token.value;
        }
    }

    return { dueDate, deadlineDate };
}

export function formatLocalizedDate(isoDate: string, localeTag: string): string {
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
                : 'paragraph';
    const order = Math.max(1, Math.floor(Number(raw.order ?? 1) || 1));
    const checked = raw.checked === true;
    const taskStatus = normalizeTaskStatus(raw.taskStatus);
    const dueDate = normalizeNullableIsoDate(raw.dueDate);
    const deadlineDate = normalizeNullableIsoDate(raw.deadlineDate);
    const startedAt = normalizeNullableTimestamp(raw.startedAt);
    const completedAt = normalizeNullableTimestamp(raw.completedAt);
    const backlogPromotedAt = normalizeNullableTimestamp(raw.backlogPromotedAt);

    return {
        ...raw,
        indent: sanitizeIndent(raw.indent),
        blockStyle,
        order,
        checked,
        taskStatus,
        dueDate,
        deadlineDate,
        startedAt,
        completedAt,
        backlogPromotedAt,
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
        if (node.type.name !== 'paragraph' && node.type.name !== 'heading') {
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
    const currentPrefixLength =
        textContent.startsWith('? ') || textContent.startsWith('/ ') ? 2 : 0;
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
    if (!currentNode || currentNode.type.name !== 'heading') {
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
            blockStyle === 'task'
                ? options?.checked ?? attrs.checked === true
                : false,
        taskStatus:
            blockStyle === 'task'
                ? normalizeTaskStatus(options?.taskStatus ?? attrs.taskStatus)
                : null,
        dueDate: blockStyle === 'task' ? attrs.dueDate : null,
        deadlineDate: blockStyle === 'task' ? attrs.deadlineDate : null,
        startedAt: blockStyle === 'task' ? attrs.startedAt : null,
        completedAt: blockStyle === 'task' ? attrs.completedAt : null,
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
    if (attrs.blockStyle !== 'task') {
        return false;
    }

    return dispatchParagraphAttrsUpdate(state, dispatch, pos, {
        ...attrs,
        checked,
        completedAt: checked ? nowIsoTimestamp() : null,
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
            checked: false,
            completedAt: null,
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
            checked: true,
            completedAt: timestamp,
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
            completedAt: null,
        });

        transaction = updateTaskStatusTextPrefixInTransaction(transaction, pos, '');

        dispatch(transaction);

        return true;
    }

    let transaction = state.tr.setNodeMarkup(pos, undefined, {
        ...attrs,
        checked: true,
        taskStatus: null,
        completedAt: timestamp,
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

    let transaction = state.tr.setNodeMarkup(pos, undefined, {
        ...attrs,
        taskStatus: normalizedTaskStatus,
        checked: normalizedTaskStatus === null ? attrs.checked === true : false,
        startedAt:
            normalizedTaskStatus === 'in_progress' && attrs.taskStatus !== 'in_progress'
                ? timestamp
                : attrs.startedAt,
        completedAt: normalizedTaskStatus === null ? attrs.completedAt : null,
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
    const markerWidth = 22;

    return {
        left: rect.left + Math.max(0, paddingLeft - markerWidth),
        right: rect.left + paddingLeft,
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

    let transaction = state.tr.setNodeMarkup(current.pos, undefined, {
        ...attrs,
        level: currentLevel + 1,
    });

    transaction = updateHeadingTextPrefixInTransaction(transaction, current.pos, currentLevel + 1);

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

        let transaction = state.tr.setNodeMarkup(
            current.pos,
            editor.schema.nodes.paragraph,
            normalizeParagraphAttrs({}),
        );

        transaction = updateHeadingTextPrefixInTransaction(transaction, current.pos, null);

        dispatch(transaction);

        return true;
    }

    if (!dispatch) {
        return true;
    }

    let transaction = state.tr.setNodeMarkup(current.pos, undefined, {
        ...attrs,
        level: currentLevel - 1,
    });

    transaction = updateHeadingTextPrefixInTransaction(transaction, current.pos, currentLevel - 1);

    dispatch(transaction);

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

    let transaction = state.tr.setNodeMarkup(
        current.pos,
        editor.schema.nodes.heading,
        normalizeHeadingAttrs({ level: normalizedLevel }),
    );

    transaction = updateHeadingTextPrefixInTransaction(transaction, current.pos, normalizedLevel);

    dispatch(transaction);

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

    let transaction = state.tr.setNodeMarkup(
        current.pos,
        editor.schema.nodes.paragraph,
        normalizeParagraphAttrs({}),
    );

    transaction = updateHeadingTextPrefixInTransaction(transaction, current.pos, null);

    dispatch(transaction);

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
            attrs.blockStyle === 'task'
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
        attrs.blockStyle === 'task'
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
            dueDate: null,
            deadlineDate: null,
            startedAt: null,
            completedAt: null,
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
        const nextStatus = detectTaskStatusFromTextPrefix(currentNode.textContent);
        const parsedDates = parseBlockTaskDates(currentNode.textContent);
        if (currentAttrs.taskStatus === nextStatus) {
            if (
                currentAttrs.dueDate === parsedDates.dueDate &&
                currentAttrs.deadlineDate === parsedDates.deadlineDate
            ) {
                return true;
            }
        }

        transaction = transaction.setNodeMarkup(mappedPos, undefined, {
            ...currentAttrs,
            taskStatus: nextStatus,
            dueDate: parsedDates.dueDate,
            deadlineDate: parsedDates.deadlineDate,
            checked: nextStatus === null ? currentAttrs.checked === true : false,
            startedAt:
                nextStatus === 'in_progress' && currentAttrs.taskStatus !== 'in_progress'
                    ? nowIsoTimestamp()
                    : currentAttrs.startedAt,
            completedAt: nextStatus === null ? currentAttrs.completedAt : null,
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
    const current = getCurrentBlockNodeFromState(state);
    const activeHeadingPos = current?.type === 'heading' ? current.pos : null;

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
            if (activeHeadingPos === pos) {
                transaction = transaction.setNodeMarkup(
                    mappedPos,
                    editor.schema.nodes.paragraph,
                    normalizeParagraphAttrs({}),
                );
                transaction = updateHeadingTextPrefixInTransaction(transaction, mappedPos, null);
            } else {
                transaction = updateHeadingTextPrefixInTransaction(
                    transaction,
                    mappedPos,
                    Number(attrs.level ?? 1),
                );
            }
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
