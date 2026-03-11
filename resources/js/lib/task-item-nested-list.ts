import { TextSelection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';

type NestedListType = 'bulletList' | 'orderedList' | 'checkList';

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

export function isInNestedTaskListInTaskItem(editor: Editor | null): boolean {
    if (!editor || !editor.isEditable) {
        return false;
    }

    return isInNestedTaskList(editor);
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

function isInsideChecklistNestedList(editor: Editor): boolean {
    const { $from } = editor.state.selection;

    for (let depth = $from.depth; depth > 0; depth -= 1) {
        const name = $from.node(depth).type.name;
        if (name !== 'checkList') {
            continue;
        }

        for (let ancestorDepth = depth - 1; ancestorDepth > 0; ancestorDepth -= 1) {
            if ($from.node(ancestorDepth).type.name === 'taskItem') {
                return true;
            }
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

export function isInsideNestedContextListInTaskItem(
    editor: Editor | null,
): boolean {
    if (!editor || !editor.isEditable) {
        return false;
    }

    return isInsideRegularNestedList(editor) || isInsideChecklistNestedList(editor);
}

export function canLiftCheckItemSafelyInTaskContext(
    editor: Editor | null,
): boolean {
    if (!editor || !editor.isEditable || !editor.isActive('checkItem')) {
        return false;
    }

    const { $from } = editor.state.selection;

    for (let depth = $from.depth; depth > 0; depth -= 1) {
        if ($from.node(depth).type.name !== 'checkList') {
            continue;
        }

        if (depth <= 0) {
            return false;
        }

        // Safe only when this checklist is nested under another checklist item.
        return $from.node(depth - 1).type.name === 'checkItem';
    }

    return false;
}

export function promoteCheckItemToRegularListItemInTaskContext(
    editor: Editor | null,
): boolean {
    if (!editor || !editor.isEditable || !editor.isActive('checkItem')) {
        return false;
    }

    const { state, view } = editor;
    const { $from } = state.selection;
    const listItemType = state.schema.nodes.listItem;

    if (!listItemType) {
        return false;
    }

    let checkItemDepth: number | null = null;
    let checkListDepth: number | null = null;

    for (let depth = $from.depth; depth > 0; depth -= 1) {
        const name = $from.node(depth).type.name;
        if (checkItemDepth === null && name === 'checkItem') {
            checkItemDepth = depth;
            continue;
        }

        if (checkItemDepth !== null && checkListDepth === null && name === 'checkList') {
            checkListDepth = depth;
            break;
        }
    }

    if (checkItemDepth === null || checkListDepth === null) {
        return false;
    }

    const parentContainerDepth = checkListDepth - 1;
    if (parentContainerDepth <= 0) {
        return false;
    }

    const parentContainerNode = $from.node(parentContainerDepth);
    const parentContainerName = parentContainerNode.type.name;

    const checkItemNode = $from.node(checkItemDepth);
    const checkListNode = $from.node(checkListDepth);
    const checkItemType = state.schema.nodes.checkItem;
    const taskItemType = state.schema.nodes.taskItem;

    const checkItemPos = $from.before(checkItemDepth);
    const checkListPos = $from.before(checkListDepth);
    const parentContainerPos = $from.before(parentContainerDepth);
    const insertAfterParentPos = parentContainerPos + parentContainerNode.nodeSize;

    let convertedNode: any | null = null;
    if (parentContainerName === 'listItem') {
        convertedNode = listItemType.create({}, checkItemNode.content);
    } else if (parentContainerName === 'taskItem' && taskItemType) {
        convertedNode = taskItemType.create(
            { checked: Boolean(checkItemNode.attrs?.checked) },
            checkItemNode.content,
        );
    } else if (parentContainerName === 'checkItem' && checkItemType) {
        convertedNode = checkItemType.create(
            { checked: Boolean(checkItemNode.attrs?.checked) },
            checkItemNode.content,
        );
    }

    if (!convertedNode) {
        return false;
    }

    let tr = state.tr;

    if (checkListNode.childCount <= 1) {
        tr = tr.delete(checkListPos, checkListPos + checkListNode.nodeSize);
    } else {
        tr = tr.delete(checkItemPos, checkItemPos + checkItemNode.nodeSize);
    }

    const mappedInsertPos = tr.mapping.map(insertAfterParentPos, -1);
    tr = tr.insert(mappedInsertPos, convertedNode);

    const selectionPos = Math.min(
        tr.doc.content.size,
        Math.max(1, mappedInsertPos + 2),
    );
    tr = tr.setSelection(TextSelection.create(tr.doc, selectionPos));
    view.dispatch(tr.scrollIntoView());

    return true;
}

export function promoteRegularListItemToTaskItemInTaskContext(
    editor: Editor | null,
): boolean {
    if (!editor || !editor.isEditable || !editor.isActive('listItem')) {
        return false;
    }

    const { state, view } = editor;
    const { $from } = state.selection;
    const listItemType = state.schema.nodes.listItem;
    const taskItemType = state.schema.nodes.taskItem;

    if (!listItemType || !taskItemType) {
        return false;
    }

    let listItemDepth: number | null = null;
    let regularListDepth: number | null = null;
    let parentTaskItemDepth: number | null = null;

    for (let depth = $from.depth; depth > 0; depth -= 1) {
        const name = $from.node(depth).type.name;
        if (listItemDepth === null && name === 'listItem') {
            listItemDepth = depth;
            continue;
        }

        if (
            listItemDepth !== null &&
            regularListDepth === null &&
            (name === 'bulletList' || name === 'orderedList')
        ) {
            regularListDepth = depth;
            continue;
        }

        if (regularListDepth !== null && parentTaskItemDepth === null && name === 'taskItem') {
            parentTaskItemDepth = depth;
            break;
        }
    }

    if (
        listItemDepth === null ||
        regularListDepth === null ||
        parentTaskItemDepth === null
    ) {
        return false;
    }

    // Promote only from first regular-list level under a task item.
    if (regularListDepth - 1 !== parentTaskItemDepth) {
        return false;
    }

    const listItemNode = $from.node(listItemDepth);
    const regularListNode = $from.node(regularListDepth);
    const parentTaskItemNode = $from.node(parentTaskItemDepth);

    const listItemPos = $from.before(listItemDepth);
    const regularListPos = $from.before(regularListDepth);
    const parentTaskItemPos = $from.before(parentTaskItemDepth);
    const insertAfterParentTaskItemPos = parentTaskItemPos + parentTaskItemNode.nodeSize;

    const promotedTaskItem = taskItemType.create({ checked: false }, listItemNode.content);

    let tr = state.tr;

    if (regularListNode.childCount <= 1) {
        tr = tr.delete(regularListPos, regularListPos + regularListNode.nodeSize);
    } else {
        tr = tr.delete(listItemPos, listItemPos + listItemNode.nodeSize);
    }

    const mappedInsertPos = tr.mapping.map(insertAfterParentTaskItemPos, -1);
    tr = tr.insert(mappedInsertPos, promotedTaskItem);

    const selectionPos = Math.min(
        tr.doc.content.size,
        Math.max(1, mappedInsertPos + 2),
    );
    tr = tr.setSelection(TextSelection.create(tr.doc, selectionPos));
    view.dispatch(tr.scrollIntoView());

    return true;
}

export function promoteTaskItemToRegularListItemInTaskContext(
    editor: Editor | null,
): boolean {
    if (!editor || !editor.isEditable || !editor.isActive('taskItem')) {
        return false;
    }

    const { state, view } = editor;
    const { $from } = state.selection;
    const listItemType = state.schema.nodes.listItem;
    const checkItemType = state.schema.nodes.checkItem;
    const taskItemType = state.schema.nodes.taskItem;

    if (!listItemType || !taskItemType) {
        return false;
    }

    let taskItemDepth: number | null = null;
    let nestedTaskListDepth: number | null = null;

    for (let depth = $from.depth; depth > 0; depth -= 1) {
        const name = $from.node(depth).type.name;
        if (taskItemDepth === null && name === 'taskItem') {
            taskItemDepth = depth;
            continue;
        }

        if (taskItemDepth !== null && nestedTaskListDepth === null && name === 'taskList') {
            nestedTaskListDepth = depth;
            break;
        }
    }

    if (taskItemDepth === null || nestedTaskListDepth === null) {
        return false;
    }

    const parentContainerDepth = nestedTaskListDepth - 1;
    if (parentContainerDepth <= 0) {
        return false;
    }

    const parentContainerNode = $from.node(parentContainerDepth);
    const parentContainerName = parentContainerNode.type.name;

    const taskItemNode = $from.node(taskItemDepth);
    const nestedTaskListNode = $from.node(nestedTaskListDepth);

    const taskItemPos = $from.before(taskItemDepth);
    const nestedTaskListPos = $from.before(nestedTaskListDepth);
    const parentContainerPos = $from.before(parentContainerDepth);
    const insertAfterParentContainerPos = parentContainerPos + parentContainerNode.nodeSize;

    let promotedNode: any | null = null;
    if (parentContainerName === 'listItem') {
        promotedNode = listItemType.create({}, taskItemNode.content);
    } else if (parentContainerName === 'checkItem' && checkItemType) {
        promotedNode = checkItemType.create(
            { checked: Boolean(taskItemNode.attrs?.checked) },
            taskItemNode.content,
        );
    }

    if (!promotedNode) {
        return false;
    }

    let tr = state.tr;

    if (nestedTaskListNode.childCount <= 1) {
        tr = tr.delete(
            nestedTaskListPos,
            nestedTaskListPos + nestedTaskListNode.nodeSize,
        );
    } else {
        tr = tr.delete(taskItemPos, taskItemPos + taskItemNode.nodeSize);
    }

    const mappedInsertPos = tr.mapping.map(insertAfterParentContainerPos, -1);
    tr = tr.insert(mappedInsertPos, promotedNode);

    const selectionPos = Math.min(
        tr.doc.content.size,
        Math.max(1, mappedInsertPos + 2),
    );
    tr = tr.setSelection(TextSelection.create(tr.doc, selectionPos));
    view.dispatch(tr.scrollIntoView());

    return true;
}

export function canLiftRegularListItemSafelyInTaskContext(
    editor: Editor | null,
): boolean {
    if (!editor || !editor.isEditable || !editor.isActive('listItem')) {
        return false;
    }

    const { $from } = editor.state.selection;

    for (let depth = $from.depth; depth > 0; depth -= 1) {
        const nodeName = $from.node(depth).type.name;
        if (nodeName !== 'bulletList' && nodeName !== 'orderedList') {
            continue;
        }

        if (depth <= 0) {
            return false;
        }

        // Safe only when this regular list is nested under another list item
        // (regular or checklist). If it's directly under taskItem, lifting
        // would flatten content into the task body and corrupt structure.
        const parentName = $from.node(depth - 1).type.name;
        return parentName === 'listItem' || parentName === 'checkItem';
    }

    return false;
}

export function canHandleNestedListInTaskItem(
    editor: Editor | null,
    type: NestedListType,
): boolean {
    if (!editor || !editor.isEditable || !editor.isActive('taskItem')) {
        return false;
    }

    if (type !== 'checkList' && isInsideRegularNestedList(editor)) {
        return false;
    }

    const targetListType = editor.state.schema.nodes[type];
    const listItemType =
        type === 'checkList'
            ? editor.state.schema.nodes.checkItem
            : editor.state.schema.nodes.listItem;

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
    const listItemType =
        type === 'checkList'
            ? state.schema.nodes.checkItem
            : state.schema.nodes.listItem;
    const paragraphType = state.schema.nodes.paragraph;
    const taskItemType = state.schema.nodes.taskItem;
    const bulletListType = state.schema.nodes.bulletList;
    const orderedListType = state.schema.nodes.orderedList;

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

    // Convert a regular nested bullet/ordered list under a task item into a nested checklist.
    if (type === 'checkList') {
        const regularNestedListDepth = findDepth(
            editor,
            (depth) => {
                const node = state.selection.$from.node(depth);
                const isRegularList =
                    node.type === bulletListType || node.type === orderedListType;

                if (!isRegularList) {
                    return false;
                }

                // Support any nested regular list level as long as it is within
                // a task-item subtree.
                for (let ancestorDepth = depth - 1; ancestorDepth > 0; ancestorDepth -= 1) {
                    if (state.selection.$from.node(ancestorDepth).type.name === 'taskItem') {
                        return true;
                    }
                }

                return false;
            },
        );

        if (regularNestedListDepth !== null) {
            const listPos = state.selection.$from.before(regularNestedListDepth);
            const listNode = state.selection.$from.node(regularNestedListDepth);
            const sourceListItemType = state.schema.nodes.listItem;
            const convertedChildren: any[] = [];

            listNode.forEach((child) => {
                if (sourceListItemType && child.type === sourceListItemType) {
                    convertedChildren.push(
                        listItemType.create({ checked: false }, child.content),
                    );
                    return;
                }

                convertedChildren.push(child);
            });

            const convertedList = targetListType.create({}, convertedChildren);
            let tr = state.tr.replaceWith(
                listPos,
                listPos + listNode.nodeSize,
                convertedList,
            );

            const mappedListPos = tr.mapping.map(listPos, -1);
            const targetPos = Math.min(
                tr.doc.content.size,
                Math.max(1, mappedListPos + 3),
            );
            tr = tr.setSelection(TextSelection.create(tr.doc, targetPos));
            view.dispatch(tr.scrollIntoView());

            return true;
        }
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

export function toggleNestedTaskListInTaskItem(editor: Editor | null): boolean {
    if (!editor || !editor.isEditable || !editor.isActive('taskItem')) {
        return false;
    }

    const { state, view } = editor;
    const taskListType = state.schema.nodes.taskList;
    const taskItemType = state.schema.nodes.taskItem;
    const listItemType = state.schema.nodes.listItem;
    const checkItemType = state.schema.nodes.checkItem;
    const paragraphType = state.schema.nodes.paragraph;
    const bulletListType = state.schema.nodes.bulletList;
    const orderedListType = state.schema.nodes.orderedList;
    const checkListType = state.schema.nodes.checkList;

    if (!taskListType || !taskItemType || !paragraphType) {
        return false;
    }

    const findConvertibleNestedListDepth = (): number | null => {
        const { $from } = state.selection;

        for (let depth = $from.depth; depth > 0; depth -= 1) {
            const node = $from.node(depth);
            const isConvertible =
                node.type === bulletListType ||
                node.type === orderedListType ||
                node.type === checkListType;

            if (!isConvertible) {
                continue;
            }

            for (
                let ancestorDepth = depth - 1;
                ancestorDepth > 0;
                ancestorDepth -= 1
            ) {
                if ($from.node(ancestorDepth).type.name === 'taskItem') {
                    return depth;
                }
            }
        }

        return null;
    };

    const nestedListDepth = findConvertibleNestedListDepth();
    if (nestedListDepth !== null) {
        const listPos = state.selection.$from.before(nestedListDepth);
        const listNode = state.selection.$from.node(nestedListDepth);
        const convertedChildren: any[] = [];

        listNode.forEach((child) => {
            if (listItemType && child.type === listItemType) {
                convertedChildren.push(taskItemType.create({ checked: false }, child.content));
                return;
            }

            if (checkItemType && child.type === checkItemType) {
                convertedChildren.push(
                    taskItemType.create(
                        { checked: Boolean(child.attrs?.checked) },
                        child.content,
                    ),
                );
                return;
            }

            convertedChildren.push(child);
        });

        const convertedTaskList = taskListType.create({}, convertedChildren);
        let tr = state.tr.replaceWith(
            listPos,
            listPos + listNode.nodeSize,
            convertedTaskList,
        );

        const mappedPos = tr.mapping.map(listPos, -1);
        const targetPos = Math.min(
            tr.doc.content.size,
            Math.max(1, mappedPos + 3),
        );
        tr = tr.setSelection(TextSelection.create(tr.doc, targetPos));
        view.dispatch(tr.scrollIntoView());
        return true;
    }

    // No nested bullet/checklist found at cursor: create a nested subtask list
    // under the current task item.
    const taskItemDepth = findDepth(
        editor,
        (depth) => state.selection.$from.node(depth).type.name === 'taskItem',
    );

    if (taskItemDepth === null) {
        return false;
    }

    const taskItemPos = state.selection.$from.before(taskItemDepth);
    const taskItemNode = state.selection.$from.node(taskItemDepth);

    const nestedTaskList = taskListType.create({}, [
        taskItemType.create({ checked: false }, [paragraphType.create()]),
    ]);

    let tr = state.tr.insert(
        taskItemPos + taskItemNode.nodeSize - 1,
        nestedTaskList,
    );
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
    let checkListDepth: number | null = null;
    let checkItemDepth: number | null = null;
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

        if (checkListDepth === null && name === 'checkList') {
            checkListDepth = depth;
        }

        if (checkItemDepth === null && name === 'checkItem') {
            checkItemDepth = depth;
        }

        if (name === 'taskItem') {
            hasTaskItemAncestor = true;
        }
    }

    if (!hasTaskItemAncestor) {
        return false;
    }

    if (listItemDepth !== null && regularListDepth !== null) {
        return regularListDepth < listItemDepth;
    }

    if (checkItemDepth !== null && checkListDepth !== null) {
        return checkListDepth < checkItemDepth;
    }

    return false;
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
