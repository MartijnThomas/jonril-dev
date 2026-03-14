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

function findCurrentBlockTask(editor: any): { blockId: string | null; position: number | null } | null {
    const selectionFrom = editor?.state?.selection?.from;
    if (!selectionFrom) {
        return null;
    }

    let position = 0;
    let found: { blockId: string | null; position: number | null } | null = null;

    editor.state.doc.descendants((node: any, pos: number) => {
        if (node.type?.name !== 'paragraph' || node.attrs?.blockStyle !== 'task') {
            return true;
        }

        position += 1;

        const from = pos;
        const to = pos + node.nodeSize;
        if (selectionFrom >= from && selectionFrom <= to) {
            const blockId =
                typeof node.attrs?.id === 'string' && node.attrs.id.trim() !== ''
                    ? node.attrs.id
                    : null;
            found = {
                blockId,
                position,
            };

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
            const isLegacyTask = editor.isActive('taskItem');
            const isBlockTask =
                editor.isActive('paragraph') &&
                editor.getAttributes('paragraph')?.blockStyle === 'task';

            if (!isLegacyTask && !isBlockTask) {
                return false;
            }

            let blockId: string | null = null;
            let taskPosition: number | null = null;

            if (isLegacyTask) {
                blockId = (editor.getAttributes('taskItem')?.id ?? null) as
                    | string
                    | null;
                taskPosition = findCurrentTaskPosition(editor);
            } else {
                const currentBlockTask = findCurrentBlockTask(editor);
                blockId = currentBlockTask?.blockId ?? null;
                taskPosition = currentBlockTask?.position ?? null;
            }

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
