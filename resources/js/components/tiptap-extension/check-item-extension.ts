import { TaskItem } from '@tiptap/extension-list';

export const CheckItem = TaskItem.extend({
    name: 'checkItem',

    addOptions() {
        const parentOptions = this.parent?.();

        return {
            ...(parentOptions ?? {}),
            nested: parentOptions?.nested ?? true,
            HTMLAttributes: parentOptions?.HTMLAttributes ?? {},
            taskListTypeName: 'checkList',
        };
    },

    parseHTML() {
        return [
            {
                tag: `li[data-type="${this.name}"]`,
                priority: 51,
            },
        ];
    },

    // Checklist items are intentionally plain checked list items, so no
    // markdown marker auto-input like "- [ ] " is added here.
    addInputRules() {
        return [];
    },
});
