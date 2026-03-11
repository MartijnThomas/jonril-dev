import { TaskList } from '@tiptap/extension-list';

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        checkList: {
            toggleCheckList: () => ReturnType;
        };
    }
}

export const CheckList = TaskList.extend({
    name: 'checkList',

    addOptions() {
        const parentOptions = this.parent?.();

        return {
            ...(parentOptions ?? {}),
            itemTypeName: 'checkItem',
            HTMLAttributes: parentOptions?.HTMLAttributes ?? {},
        };
    },

    parseHTML() {
        return [
            {
                tag: `ul[data-type="${this.name}"]`,
                priority: 51,
            },
        ];
    },

    addCommands() {
        return {
            toggleCheckList:
                () =>
                ({ commands }) => {
                    return commands.toggleList(this.name, this.options.itemTypeName);
                },
        };
    },
});
