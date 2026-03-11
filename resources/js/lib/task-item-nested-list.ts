import { TextSelection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';

type NestedListType = 'bulletList' | 'orderedList';

function findDepth(
    editor: Editor,
    predicate: (depth: number) => boolean,
): number | null {
    const { $from } = editor.state.selection;

    for (let depth = $from.depth; depth > 0; depth -= 1) {
        if (predicate(depth)) {
            return depth;
        }
    }

    return null;
}

function isInNestedTaskList(editor: Editor): boolean {
    const { $from } = editor.state.selection;

    for (let depth = $from.depth; depth > 0; depth -= 1) {
        if (
            $from.node(depth).type.name === 'taskList' &&
            depth > 0 &&
            $from.node(depth - 1).type.name === 'taskItem'
        ) {
            return true;
        }
    }

    return false;
}

function isInsideRegularNestedList(editor: Editor): boolean {
    const { $from } = editor.state.selection;

    for (let depth = $from.depth; depth > 0; depth -= 1) {
        const name = $from.node(depth).type.name;
        if (name !== 'bulletList' && name !== 'orderedList') {
            continue;
        }

        if (depth > 0 && $from.node(depth - 1).type.name === 'taskItem') {
            return true;
        }
    }

    return false;
}

export function isInsideRegularNestedListInTaskItem(
    editor: Editor | null,
): boolean {
    if (!editor || !editor.isEditable) {
        return false;
    }

    return isInsideRegularNestedList(editor);
}

export function canHandleNestedListInTaskItem(
    editor: Editor | null,
    type: NestedListType,
): boolean {
    if (!editor || !editor.isEditable || !editor.isActive('taskItem')) {
        return false;
    }

    if (isInsideRegularNestedList(editor)) {
        return false;
    }

    const targetListType = editor.state.schema.nodes[type];
    const listItemType = editor.state.schema.nodes.listItem;

    if (!targetListType || !listItemType) {
        return false;
    }

    return true;
}

export function toggleNestedListInTaskItem(
    editor: Editor | null,
    type: NestedListType,
): boolean {
    if (!canHandleNestedListInTaskItem(editor, type) || !editor) {
        return false;
    }

    const { state, view } = editor;
    const targetListType = state.schema.nodes[type];
    const listItemType = state.schema.nodes.listItem;
    const paragraphType = state.schema.nodes.paragraph;
    const taskItemType = state.schema.nodes.taskItem;

    if (!targetListType || !listItemType || !paragraphType || !taskItemType) {
        return false;
    }

    const nestedTaskListDepth = findDepth(
        editor,
        (depth) =>
            state.selection.$from.node(depth).type.name === 'taskList' &&
            depth > 0 &&
            state.selection.$from.node(depth - 1).type.name === 'taskItem',
    );

    // Convert nested subtasks into a regular nested bullet/ordered list.
    if (nestedTaskListDepth !== null) {
        const taskListPos = state.selection.$from.before(nestedTaskListDepth);
        const taskListNode = state.selection.$from.node(nestedTaskListDepth);
        const convertedChildren: any[] = [];
        taskListNode.forEach((child) => {
            if (child.type === taskItemType) {
                convertedChildren.push(listItemType.create({}, child.content));
                return;
            }

            convertedChildren.push(child);
        });

        const convertedList = targetListType.create(
            type === 'orderedList' ? { start: 1 } : {},
            convertedChildren,
        );

        let tr = state.tr.replaceWith(
            taskListPos,
            taskListPos + taskListNode.nodeSize,
            convertedList,
        );

        const mappedTaskListPos = tr.mapping.map(taskListPos, -1);
        const targetPos = Math.min(
            tr.doc.content.size,
            Math.max(1, mappedTaskListPos + 3),
        );
        tr = tr.setSelection(TextSelection.create(tr.doc, targetPos));
        view.dispatch(tr.scrollIntoView());

        return true;
    }

    // Otherwise create a nested regular list under the current task item.
    const taskItemDepth = findDepth(
        editor,
        (depth) => state.selection.$from.node(depth).type.name === 'taskItem',
    );

    if (taskItemDepth === null) {
        return false;
    }

    const taskItemPos = state.selection.$from.before(taskItemDepth);
    const taskItemNode = state.selection.$from.node(taskItemDepth);

    const nestedList = targetListType.create(
        type === 'orderedList' ? { start: 1 } : {},
        [listItemType.create({}, [paragraphType.create()])],
    );

    let tr = state.tr.insert(taskItemPos + taskItemNode.nodeSize - 1, nestedList);
    const insertPos = taskItemPos + taskItemNode.nodeSize - 1;
    const targetPos = Math.min(tr.doc.content.size, Math.max(1, insertPos + 3));
    tr = tr.setSelection(TextSelection.create(tr.doc, targetPos));
    view.dispatch(tr.scrollIntoView());

    return true;
}

export function createDefaultNestedBulletInTaskItem(
    editor: Editor | null,
): boolean {
    if (!editor || !editor.isEditable || !editor.isActive('taskItem')) {
        return false;
    }

    // Primary behavior for Tab in a task: indent the current task item under
    // the previous task item, then convert that nested task list into
    // a regular nested bullet list.
    const sunk = editor.chain().focus().sinkListItem('taskItem').run();
    if (sunk) {
        return toggleNestedListInTaskItem(editor, 'bulletList');
    }

    return false;
}

export function shouldHandleNestedListInTaskItem(editor: Editor | null): boolean {
    if (!editor || !editor.isEditable) {
        return false;
    }

    if (!editor.isActive('taskItem')) {
        return false;
    }

    return !isInsideRegularNestedList(editor) || isInNestedTaskList(editor);
}

export function shouldLiftRegularNestedListItemOnBackspace(
    editor: Editor | null,
): boolean {
    if (!editor || !editor.isEditable) {
        return false;
    }

    const { state } = editor;
    const { selection } = state;
    if (!selection.empty) {
        return false;
    }

    const { $from } = selection;
    if (!$from.parent.isTextblock || $from.parentOffset !== 0) {
        return false;
    }

    let listItemDepth: number | null = null;
    let regularListDepth: number | null = null;
    let hasTaskItemAncestor = false;

    for (let depth = $from.depth; depth > 0; depth -= 1) {
        const name = $from.node(depth).type.name;

        if (listItemDepth === null && name === 'listItem') {
            listItemDepth = depth;
        }

        if (
            regularListDepth === null &&
            (name === 'bulletList' || name === 'orderedList')
        ) {
            regularListDepth = depth;
        }

        if (name === 'taskItem') {
            hasTaskItemAncestor = true;
        }
    }

    if (!hasTaskItemAncestor || listItemDepth === null || regularListDepth === null) {
        return false;
    }

    return regularListDepth < listItemDepth;
}

export function joinTaskParagraphOnBackspace(editor: Editor | null): boolean {
    if (!editor || !editor.isEditable) {
        return false;
    }

    const { state, view } = editor;
    const { selection } = state;
    if (!selection.empty) {
        return false;
    }

    const { $from } = selection;
    if ($from.parent.type.name !== 'paragraph' || $from.parentOffset !== 0) {
        return false;
    }

    let paragraphDepth: number | null = null;
    let taskItemDepth: number | null = null;

    for (let depth = $from.depth; depth > 0; depth -= 1) {
        const name = $from.node(depth).type.name;
        if (paragraphDepth === null && name === 'paragraph') {
            paragraphDepth = depth;
        }
        if (taskItemDepth === null && name === 'taskItem') {
            taskItemDepth = depth;
            break;
        }
    }

    if (paragraphDepth === null || taskItemDepth === null) {
        return false;
    }

    const parent = $from.node(taskItemDepth);
    const paragraphIndex = $from.index(taskItemDepth);
    if (paragraphIndex <= 0) {
        return false;
    }

    const previousSibling = parent.child(paragraphIndex - 1);
    if (previousSibling.type.name !== 'paragraph') {
        return false;
    }

    const joinPos = $from.before(paragraphDepth);
    if (!state.doc.resolve(joinPos).nodeBefore || !state.doc.resolve(joinPos).nodeAfter) {
        return false;
    }

    let tr = state.tr.join(joinPos);
    tr = tr.setSelection(TextSelection.create(tr.doc, Math.max(1, joinPos - 1)));
    view.dispatch(tr.scrollIntoView());

    return true;
}
