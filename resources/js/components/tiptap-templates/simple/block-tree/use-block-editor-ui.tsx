import { router } from '@inertiajs/react';
import type { Editor } from '@tiptap/core';
import { useEffect, useMemo, useState } from 'react';
import { TaskMigratePicker } from '@/components/task-migrate-picker';
import { BlockNodeToolbar } from '@/components/tiptap-templates/simple/block-tree/block-node-toolbar';
import { BlockTaskActionsMenu } from '@/components/tiptap-templates/simple/block-tree/block-task-actions-menu';
import { BlockTaskStatusMenu } from '@/components/tiptap-templates/simple/block-tree/block-task-status-menu';
import { BlockTokenSuggestionMenu } from '@/components/tiptap-templates/simple/block-tree/block-token-suggestion-menu';
import {
    setParagraphTaskStatusAtPos,
    toggleParagraphTaskAtPos,
} from '@/components/tiptap-templates/simple/block-tree/block-tree-model';

type BlockTaskStatus =
    | 'backlog'
    | 'in_progress'
    | 'starred'
    | 'assigned'
    | 'deferred'
    | 'canceled'
    | null;

type UseBlockEditorUiOptions = {
    editor: Editor | null;
    noteId: string;
    language: 'nl' | 'en';
    linkableNotes: {
        id: string;
        title: string;
        path?: string;
        href?: string;
    }[];
    workspaceSuggestions: {
        mentions: string[];
        hashtags: string[];
    };
};

export function useBlockEditorUi({
    editor,
    noteId,
    language,
    linkableNotes,
    workspaceSuggestions,
}: UseBlockEditorUiOptions) {
    const [taskMigratePicker, setTaskMigratePicker] = useState<{
        open: boolean;
        blockId: string | null;
        position: number | null;
        anchorPoint: { x: number; y: number } | null;
    }>({
        open: false,
        blockId: null,
        position: null,
        anchorPoint: null,
    });
    const [blockTaskStatusMenu, setBlockTaskStatusMenu] = useState<{
        open: boolean;
        x: number;
        y: number;
        pos: number | null;
        status: BlockTaskStatus;
    }>({
        open: false,
        x: 0,
        y: 0,
        pos: null,
        status: null,
    });
    const [blockTaskActionsMenu, setBlockTaskActionsMenu] = useState<{
        open: boolean;
        x: number;
        y: number;
        pos: number | null;
        blockId: string | null;
        status: BlockTaskStatus;
    }>({
        open: false,
        x: 0,
        y: 0,
        pos: null,
        blockId: null,
        status: null,
    });

    useEffect(() => {
        const openTaskMigratePicker = (event: Event) => {
            const customEvent = event as CustomEvent<{
                blockId?: string | null;
                position?: number | null;
                anchorPoint?: { x?: number; y?: number } | null;
            }>;

            const detailAnchor = customEvent.detail?.anchorPoint;
            const anchorPoint =
                detailAnchor &&
                typeof detailAnchor.x === 'number' &&
                typeof detailAnchor.y === 'number'
                    ? { x: detailAnchor.x, y: detailAnchor.y }
                    : null;

            setTaskMigratePicker({
                open: true,
                blockId:
                    typeof customEvent.detail?.blockId === 'string'
                        ? customEvent.detail.blockId
                        : null,
                position:
                    typeof customEvent.detail?.position === 'number'
                        ? customEvent.detail.position
                        : null,
                anchorPoint,
            });
        };

        window.addEventListener(
            'task-migrate:open',
            openTaskMigratePicker as EventListener,
        );

        return () => {
            window.removeEventListener(
                'task-migrate:open',
                openTaskMigratePicker as EventListener,
            );
        };
    }, []);

    useEffect(() => {
        const openTaskStatusMenu = (event: Event) => {
            const customEvent = event as CustomEvent<{
                x?: number;
                y?: number;
                pos?: number | null;
                status?: BlockTaskStatus;
            }>;

            setBlockTaskStatusMenu({
                open: true,
                x: typeof customEvent.detail?.x === 'number' ? customEvent.detail.x : 0,
                y: typeof customEvent.detail?.y === 'number' ? customEvent.detail.y : 0,
                pos:
                    typeof customEvent.detail?.pos === 'number'
                        ? customEvent.detail.pos
                        : null,
                status:
                    customEvent.detail?.status === 'backlog' ||
                    customEvent.detail?.status === 'in_progress' ||
                    customEvent.detail?.status === 'starred' ||
                    customEvent.detail?.status === 'assigned' ||
                    customEvent.detail?.status === 'deferred' ||
                    customEvent.detail?.status === 'canceled'
                        ? customEvent.detail.status
                        : null,
            });
        };

        window.addEventListener(
            'block-task-status-menu:open',
            openTaskStatusMenu as EventListener,
        );

        return () => {
            window.removeEventListener(
                'block-task-status-menu:open',
                openTaskStatusMenu as EventListener,
            );
        };
    }, []);

    useEffect(() => {
        const openTaskActionsMenu = (event: Event) => {
            const customEvent = event as CustomEvent<{
                x?: number;
                y?: number;
                pos?: number | null;
                blockId?: string | null;
                status?: BlockTaskStatus;
            }>;

            setBlockTaskActionsMenu({
                open: true,
                x: typeof customEvent.detail?.x === 'number' ? customEvent.detail.x : 0,
                y: typeof customEvent.detail?.y === 'number' ? customEvent.detail.y : 0,
                pos:
                    typeof customEvent.detail?.pos === 'number'
                        ? customEvent.detail.pos
                        : null,
                blockId:
                    typeof customEvent.detail?.blockId === 'string'
                        ? customEvent.detail.blockId
                        : null,
                status:
                    customEvent.detail?.status === 'backlog' ||
                    customEvent.detail?.status === 'in_progress' ||
                    customEvent.detail?.status === 'starred' ||
                    customEvent.detail?.status === 'assigned' ||
                    customEvent.detail?.status === 'deferred' ||
                    customEvent.detail?.status === 'canceled'
                        ? customEvent.detail.status
                        : null,
            });
        };

        window.addEventListener(
            'block-task-actions:open',
            openTaskActionsMenu as EventListener,
        );

        return () => {
            window.removeEventListener(
                'block-task-actions:open',
                openTaskActionsMenu as EventListener,
            );
        };
    }, []);

    const blockUi = useMemo(() => {
        if (!editor) {
            return null;
        }

        return (
            <>
                <BlockNodeToolbar editor={editor} />

                <TaskMigratePicker
                    open={taskMigratePicker.open}
                    sourceNoteId={noteId}
                    blockId={taskMigratePicker.blockId}
                    position={taskMigratePicker.position}
                    anchorPoint={taskMigratePicker.anchorPoint}
                    language={language}
                    onClose={() =>
                        setTaskMigratePicker({
                            open: false,
                            blockId: null,
                            position: null,
                            anchorPoint: null,
                        })
                    }
                    onMigrated={() => {
                        router.visit(window.location.href, {
                            only: ['content', 'relatedTasks', 'backlinks'],
                            preserveScroll: true,
                            preserveState: false,
                            replace: true,
                        });
                    }}
                />

                <BlockTokenSuggestionMenu
                    editor={editor}
                    workspaceSuggestions={workspaceSuggestions}
                />

                <BlockTaskActionsMenu
                    open={blockTaskActionsMenu.open}
                    x={blockTaskActionsMenu.x}
                    y={blockTaskActionsMenu.y}
                    status={blockTaskActionsMenu.status}
                    defaultMigrateTargets={linkableNotes
                        .filter((note) => note.id !== noteId)
                        .slice(0, 6)
                        .map((note) => ({
                            id: note.id,
                            title: note.title,
                            path: note.path,
                        }))}
                    onClose={() => {
                        setBlockTaskActionsMenu((current) => ({
                            ...current,
                            open: false,
                        }));
                    }}
                    onToggleTask={() => {
                        if (blockTaskActionsMenu.pos === null) {
                            return;
                        }

                        editor.commands.command(({ editor: commandEditor, state, dispatch }) => {
                            return toggleParagraphTaskAtPos(
                                commandEditor,
                                blockTaskActionsMenu.pos!,
                                state,
                                dispatch,
                            );
                        });
                    }}
                    onSetStatus={(status) => {
                        if (blockTaskActionsMenu.pos === null) {
                            return;
                        }

                        editor.commands.command(({ editor: commandEditor, state, dispatch }) => {
                            return setParagraphTaskStatusAtPos(
                                commandEditor,
                                blockTaskActionsMenu.pos!,
                                status,
                                state,
                                dispatch,
                            );
                        });
                    }}
                    onOpenMigratePicker={() => {
                        setTaskMigratePicker({
                            open: true,
                            blockId: blockTaskActionsMenu.blockId,
                            position: blockTaskActionsMenu.pos,
                            anchorPoint: {
                                x: blockTaskActionsMenu.x,
                                y: blockTaskActionsMenu.y,
                            },
                        });
                    }}
                    onQuickMigrate={(targetNoteId) => {
                        if (
                            blockTaskActionsMenu.blockId === null &&
                            (blockTaskActionsMenu.pos ?? 0) <= 0
                        ) {
                            return;
                        }

                        router.post(
                            '/tasks/migrate',
                            {
                                source_note_id: noteId,
                                block_id: blockTaskActionsMenu.blockId,
                                position: blockTaskActionsMenu.pos,
                                target_note_id: targetNoteId,
                                target_journal_granularity: null,
                                target_journal_period: null,
                            },
                            {
                                preserveState: true,
                                preserveScroll: true,
                                replace: true,
                                onSuccess: () => {
                                    router.visit(window.location.href, {
                                        only: ['content', 'relatedTasks', 'backlinks'],
                                        preserveScroll: true,
                                        preserveState: false,
                                        replace: true,
                                    });
                                },
                            },
                        );
                    }}
                />

                <BlockTaskStatusMenu
                    open={blockTaskStatusMenu.open}
                    x={blockTaskStatusMenu.x}
                    y={blockTaskStatusMenu.y}
                    status={blockTaskStatusMenu.status}
                    onClose={() => {
                        setBlockTaskStatusMenu((current) => ({
                            ...current,
                            open: false,
                        }));
                    }}
                    onSelect={(status) => {
                        if (blockTaskStatusMenu.pos === null) {
                            return;
                        }

                        editor.commands.command(({ editor: commandEditor, state, dispatch }) => {
                            return setParagraphTaskStatusAtPos(
                                commandEditor,
                                blockTaskStatusMenu.pos!,
                                status,
                                state,
                                dispatch,
                            );
                        });
                    }}
                />
            </>
        );
    }, [
        blockTaskActionsMenu.blockId,
        blockTaskActionsMenu.open,
        blockTaskActionsMenu.pos,
        blockTaskActionsMenu.status,
        blockTaskActionsMenu.x,
        blockTaskActionsMenu.y,
        blockTaskStatusMenu.open,
        blockTaskStatusMenu.pos,
        blockTaskStatusMenu.status,
        blockTaskStatusMenu.x,
        blockTaskStatusMenu.y,
        editor,
        language,
        linkableNotes,
        noteId,
        workspaceSuggestions,
        taskMigratePicker.anchorPoint,
        taskMigratePicker.blockId,
        taskMigratePicker.open,
        taskMigratePicker.position,
    ]);

    return {
        blockUi,
    };
}
