export type InlineCommand = {
    name: string;
    aliases?: string[];
    run: (editor: any, range: { from: number; to: number }) => boolean;
};

export const inlineCommands: InlineCommand[] = [
    {
        name: 'task',
        aliases: ['todo'],
        run: (editor, range) => {
            if (editor.isActive('taskItem')) {
                const checked = !!editor.getAttributes('taskItem').checked;

                return editor
                    .chain()
                    .focus()
                    .deleteRange(range)
                    .updateAttributes('taskItem', { checked: !checked })
                    .run();
            }

            return editor
                .chain()
                .focus()
                .deleteRange(range)
                .toggleTaskList()
                .run();
        },
    },
    {
        name: 'list',
        aliases: ['bullet'],
        run: (editor, range) => {
            return editor
                .chain()
                .focus()
                .deleteRange(range)
                .toggleBulletList()
                .run();
        },
    },
    {
        name: 'quote',
        run: (editor, range) => {
            return editor
                .chain()
                .focus()
                .deleteRange(range)
                .toggleBlockquote()
                .run();
        },
    },
    {
        name: 'code',
        run: (editor, range) => {
            return editor
                .chain()
                .focus()
                .deleteRange(range)
                .toggleCodeBlock()
                .run();
        },
    },
    {
        name: 'h1',
        run: (editor, range) => {
            return editor
                .chain()
                .focus()
                .deleteRange(range)
                .toggleHeading({ level: 1 })
                .run();
        },
    },
];
