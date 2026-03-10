export type InlineCommand = {
    name: string;
    aliases?: string[];
    run: (editor: any, range: { from: number; to: number }) => boolean;
};

function findCurrentTaskPosition(editor: any): number | null {
    const selectionFrom = editor?.state?.selection?.from;
    if (!selectionFrom) {
        return null;
    }

    let position = 0;
    let found: number | null = null;

    editor.state.doc.descendants((node: any, pos: number) => {
        if (node.type?.name !== 'taskItem') {
            return true;
        }

        position += 1;

        const from = pos;
        const to = pos + node.nodeSize;
        if (selectionFrom >= from && selectionFrom <= to) {
            found = position;
            return false;
        }

        return true;
    });

    return found;
}

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
    {
        name: 'migrate',
        aliases: ['move-task'],
        run: (editor, range) => {
            if (!editor.isActive('taskItem')) {
                return false;
            }

            const blockId = (editor.getAttributes('taskItem')?.id ?? null) as
                | string
                | null;
            const taskPosition = findCurrentTaskPosition(editor);

            const didDelete = editor.chain().focus().deleteRange(range).run();
            if (!didDelete) {
                return false;
            }

            if (typeof window !== 'undefined') {
                let anchorPoint: { x: number; y: number } | null = null;
                try {
                    const coords = editor.view.coordsAtPos(range.from);
                    if (
                        typeof coords?.left === 'number' &&
                        typeof coords?.bottom === 'number'
                    ) {
                        anchorPoint = {
                            x: coords.left,
                            y: coords.bottom,
                        };
                    }
                } catch {
                    anchorPoint = null;
                }

                window.dispatchEvent(
                    new CustomEvent('task-migrate:open', {
                        detail: {
                            blockId,
                            position: taskPosition,
                            anchorPoint,
                        },
                    }),
                );
            }

            return true;
        },
    },
];
