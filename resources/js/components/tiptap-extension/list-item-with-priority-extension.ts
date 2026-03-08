import { ListItem } from '@tiptap/extension-list';

export type TaskPriority = 'high' | 'medium' | 'normal' | null;
export type ListItemTaskStatus =
    | 'canceled'
    | 'deferred'
    | 'starred'
    | 'question'
    | null;

export const ListItemWithPriority = ListItem.extend({
    addAttributes() {
        return {
            ...(this.parent?.() ?? {}),
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
        };
    },
});
