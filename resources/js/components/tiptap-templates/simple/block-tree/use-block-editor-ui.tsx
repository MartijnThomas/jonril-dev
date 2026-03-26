import { router } from '@inertiajs/react';
import type { Editor } from '@tiptap/core';
import { addDays, addMonths, addWeeks, format, getISOWeek, getISOWeekYear } from 'date-fns';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TaskMigratePicker } from '@/components/task-migrate-picker';
import {
    BlockLineActionsMenu,
} from '@/components/tiptap-templates/simple/block-tree/block-line-actions-menu';
import type { BlockLineAction } from '@/components/tiptap-templates/simple/block-tree/block-line-actions-menu';
import { BlockNodeToolbar } from '@/components/tiptap-templates/simple/block-tree/block-node-toolbar';
import { BlockTaskActionsMenu } from '@/components/tiptap-templates/simple/block-tree/block-task-actions-menu';
import { BlockTaskStatusMenu } from '@/components/tiptap-templates/simple/block-tree/block-task-status-menu';
import { BlockTokenSuggestionMenu } from '@/components/tiptap-templates/simple/block-tree/block-token-suggestion-menu';
import {
    convertCurrentHeadingToParagraph,
    getCurrentBlockNode,
    normalizeParagraphAttrs,
    setParagraphTaskStatusAtPos,
    setCurrentHeadingLevel,
    setCurrentParagraphStyle,
    toggleParagraphTaskAtPos,
} from '@/components/tiptap-templates/simple/block-tree/block-tree-model';
import { BlockWikiLinkSuggestionMenu } from '@/components/tiptap-templates/simple/block-tree/wiki-link/block-wiki-link-suggestion-menu';

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
    mobileKeyboardInset?: number;
    linkableNotes: {
        id: string;
        title: string;
        path?: string;
        editablePath?: string;
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
    mobileKeyboardInset = 0,
    linkableNotes,
    workspaceSuggestions,
}: UseBlockEditorUiOptions) {
    const resolveSourceNoteId = useCallback((): string | null => {
        const normalizedProp = noteId.trim();
        if (normalizedProp !== '') {
            return normalizedProp;
        }

        const domNoteId =
            editor?.view?.dom?.getAttribute('data-note-id')?.trim() ?? '';
        if (domNoteId !== '') {
            return domNoteId;
        }

        if (typeof window !== 'undefined') {
            const match = window.location.pathname.match(
                /^\/(?:w\/[^/]+\/)?notes\/([0-9a-fA-F-]{36})(?:\/|$)/u,
            );
            const urlNoteId = match?.[1]?.trim() ?? '';
            if (urlNoteId !== '') {
                return urlNoteId;
            }
        }

        return null;
    }, [editor, noteId]);

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
    const [blockLineActionsMenu, setBlockLineActionsMenu] = useState<{
        open: boolean;
        x: number;
        y: number;
        pos: number | null;
    }>({
        open: false,
        x: 0,
        y: 0,
        pos: null,
    });
    const [isEditorActive, setIsEditorActive] = useState<boolean>(() => editor?.isFocused ?? false);
    const interactingWithToolbarRef = useRef(false);
    const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() => {
        if (typeof window === 'undefined') {
            return false;
        }

        return window.matchMedia('(max-width: 767px)').matches;
    });

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const mediaQuery = window.matchMedia('(max-width: 767px)');
        const sync = () => {
            setIsMobileViewport(mediaQuery.matches);
        };
        sync();
        mediaQuery.addEventListener('change', sync);

        return () => {
            mediaQuery.removeEventListener('change', sync);
        };
    }, []);

    useEffect(() => {
        if (!editor || typeof window === 'undefined') {
            return;
        }

        let blurTimeoutId: number | null = null;
        const initialSyncId = window.requestAnimationFrame(() => {
            setIsEditorActive(editor.isFocused);
        });
        const setFocused = () => {
            if (blurTimeoutId !== null) {
                window.clearTimeout(blurTimeoutId);
                blurTimeoutId = null;
            }
            setIsEditorActive(true);
        };
        const setBlurred = () => {
            blurTimeoutId = window.setTimeout(() => {
                if (interactingWithToolbarRef.current) {
                    setIsEditorActive(true);
                    interactingWithToolbarRef.current = false;
                    return;
                }

                const toolbar = document.querySelector('[data-bt-editor-toolbar="true"]');
                const activeElement = document.activeElement;
                if (toolbar instanceof HTMLElement && activeElement instanceof HTMLElement && toolbar.contains(activeElement)) {
                    setIsEditorActive(true);
                    return;
                }

                setIsEditorActive(false);
            }, 0);
        };

        editor.on('focus', setFocused);
        editor.on('blur', setBlurred);

        const markToolbarInteraction = (event: Event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) {
                interactingWithToolbarRef.current = false;
                return;
            }

            interactingWithToolbarRef.current =
                target.closest('[data-bt-editor-toolbar="true"]') !== null;
            if (interactingWithToolbarRef.current) {
                setIsEditorActive(true);
            }
        };

        document.addEventListener('pointerdown', markToolbarInteraction, true);
        document.addEventListener('touchstart', markToolbarInteraction, true);
        document.addEventListener('mousedown', markToolbarInteraction, true);

        return () => {
            window.cancelAnimationFrame(initialSyncId);
            if (blurTimeoutId !== null) {
                window.clearTimeout(blurTimeoutId);
            }
            editor.off('focus', setFocused);
            editor.off('blur', setBlurred);
            document.removeEventListener('pointerdown', markToolbarInteraction, true);
            document.removeEventListener('touchstart', markToolbarInteraction, true);
            document.removeEventListener('mousedown', markToolbarInteraction, true);
        };
    }, [editor]);

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

    useEffect(() => {
        const openLineActionsMenu = (event: Event) => {
            const customEvent = event as CustomEvent<{
                x?: number;
                y?: number;
                pos?: number | null;
            }>;

            setBlockLineActionsMenu({
                open: true,
                x: typeof customEvent.detail?.x === 'number' ? customEvent.detail.x : 0,
                y: typeof customEvent.detail?.y === 'number' ? customEvent.detail.y : 0,
                pos:
                    typeof customEvent.detail?.pos === 'number'
                        ? customEvent.detail.pos
                        : null,
            });
        };

        window.addEventListener(
            'block-line-actions:open',
            openLineActionsMenu as EventListener,
        );

        return () => {
            window.removeEventListener(
                'block-line-actions:open',
                openLineActionsMenu as EventListener,
            );
        };
    }, []);

    useEffect(() => {
        if (!editor) {
            return;
        }

        let editorDom: HTMLElement | null = null;
        try {
            editorDom = editor.view?.dom ?? null;
        } catch {
            return;
        }

        if (!editorDom) {
            return;
        }

        const activePos = blockTaskActionsMenu.open
            ? blockTaskActionsMenu.pos
            : blockTaskStatusMenu.open
                ? blockTaskStatusMenu.pos
                : blockLineActionsMenu.open
                    ? blockLineActionsMenu.pos
                    : null;

        editorDom
            .querySelectorAll<HTMLElement>(
                '[data-bt-block-handle="true"], [data-bt-task-actions-trigger="true"], [data-bt-block-add-trigger="true"]',
            )
            .forEach((trigger) => {
                const triggerPos = Number.parseInt(
                    trigger.getAttribute('data-block-pos') ?? '',
                    10,
                );
                if (Number.isFinite(triggerPos) && activePos !== null && triggerPos === activePos) {
                    trigger.setAttribute('data-bt-gutter-active', 'true');
                } else {
                    trigger.removeAttribute('data-bt-gutter-active');
                }
            });

        return () => {
            editorDom
                ?.querySelectorAll<HTMLElement>(
                    '[data-bt-block-handle="true"], [data-bt-task-actions-trigger="true"], [data-bt-block-add-trigger="true"]',
                )
                .forEach((trigger) => {
                    trigger.removeAttribute('data-bt-gutter-active');
                });
        };
    }, [
        blockLineActionsMenu.open,
        blockLineActionsMenu.pos,
        blockTaskActionsMenu.open,
        blockTaskActionsMenu.pos,
        blockTaskStatusMenu.open,
        blockTaskStatusMenu.pos,
        editor,
    ]);

    const blockUi = useMemo(() => {
        if (!editor) {
            return null;
        }

        const applyLineAction = (action: BlockLineAction) => {
            if (blockLineActionsMenu.pos === null) {
                return;
            }

            const selectionPos = Math.max(1, blockLineActionsMenu.pos + 1);
            editor.chain().focus().setTextSelection(selectionPos).run();

            if (action.startsWith('heading-')) {
                const level = Number(action.replace('heading-', ''));
                setCurrentHeadingLevel(editor, Math.min(6, Math.max(1, level)));
                return;
            }

            if (action === 'paragraph') {
                const currentBlock = getCurrentBlockNode(editor);
                if (currentBlock?.type === 'heading') {
                    convertCurrentHeadingToParagraph(editor);
                    return;
                }

                setCurrentParagraphStyle(editor, 'paragraph');
                return;
            }

            if (
                action === 'task' ||
                action === 'checklist' ||
                action === 'bullet' ||
                action === 'ordered' ||
                action === 'quote'
            ) {
                const currentBlock = getCurrentBlockNode(editor);
                if (currentBlock?.type === 'heading') {
                    convertCurrentHeadingToParagraph(editor);
                }

                const refreshedBlock = getCurrentBlockNode(editor);
                if (refreshedBlock?.type === 'paragraph') {
                    const attrs = normalizeParagraphAttrs(refreshedBlock.node.attrs);
                    setCurrentParagraphStyle(editor, action, {
                        order: action === 'ordered' ? Number(attrs.order ?? 1) : 1,
                    });
                    return;
                }

                editor.chain().focus().setNode('paragraph', normalizeParagraphAttrs({
                    blockStyle: action,
                })).run();
                return;
            }

            if (action === 'code-block') {
                editor.chain().focus().setTextSelection(selectionPos).toggleCodeBlock().run();
                return;
            }

            if (action === 'horizontal-rule') {
                editor.chain().focus().setTextSelection(selectionPos).setHorizontalRule().run();
                return;
            }

            if (action === 'image') {
                editor.chain().focus().setTextSelection(selectionPos).setImageUploadNode({}).run();
                return;
            }
        };

        return (
            <>
                {isMobileViewport ? (
                    <BlockNodeToolbar
                        editor={editor}
                        mode="mobile"
                        visible={isEditorActive}
                        keyboardInset={mobileKeyboardInset}
                    />
                ) : (
                    <BlockNodeToolbar
                        editor={editor}
                        mode="bubble"
                        visible={isEditorActive}
                    />
                )}

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
                <BlockWikiLinkSuggestionMenu
                    editor={editor}
                    notes={linkableNotes}
                    language={language}
                />

                <BlockTaskActionsMenu
                    open={blockTaskActionsMenu.open}
                    x={blockTaskActionsMenu.x}
                    y={blockTaskActionsMenu.y}
                    status={blockTaskActionsMenu.status}
                    defaultMigrateTargets={(() => {
                        const today = new Date();
                        const tomorrow = addDays(today, 1);
                        const nextWeek = addWeeks(today, 1);
                        const nextMonth = addMonths(today, 1);
                        const isNl = language === 'nl';

                        const dailyPeriod = (d: Date) => format(d, 'yyyy-MM-dd');
                        const weekPeriod = (d: Date) => `${getISOWeekYear(d)}-W${String(getISOWeek(d)).padStart(2, '0')}`;
                        const monthPeriod = (d: Date) => format(d, 'yyyy-MM');

                        return [
                            {
                                key: `journal:daily:${dailyPeriod(today)}`,
                                label: isNl ? 'Vandaag' : 'Today',
                                subtitle: format(today, 'd MMM yyyy'),
                                target_journal_granularity: 'daily',
                                target_journal_period: dailyPeriod(today),
                            },
                            {
                                key: `journal:daily:${dailyPeriod(tomorrow)}`,
                                label: isNl ? 'Morgen' : 'Tomorrow',
                                subtitle: format(tomorrow, 'd MMM yyyy'),
                                target_journal_granularity: 'daily',
                                target_journal_period: dailyPeriod(tomorrow),
                            },
                            {
                                key: `journal:weekly:${weekPeriod(today)}`,
                                label: isNl ? 'Deze week' : 'This week',
                                subtitle: `Week ${getISOWeek(today)} ${getISOWeekYear(today)}`,
                                target_journal_granularity: 'weekly',
                                target_journal_period: weekPeriod(today),
                            },
                            {
                                key: `journal:weekly:${weekPeriod(nextWeek)}`,
                                label: isNl ? 'Volgende week' : 'Next week',
                                subtitle: `Week ${getISOWeek(nextWeek)} ${getISOWeekYear(nextWeek)}`,
                                target_journal_granularity: 'weekly',
                                target_journal_period: weekPeriod(nextWeek),
                            },
                            {
                                key: `journal:monthly:${monthPeriod(nextMonth)}`,
                                label: isNl ? 'Volgende maand' : 'Next month',
                                subtitle: format(nextMonth, 'MMMM yyyy'),
                                target_journal_granularity: 'monthly',
                                target_journal_period: monthPeriod(nextMonth),
                            },
                        ];
                    })()}
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
                    onQuickMigrate={(target) => {
                        const sourceNoteId = resolveSourceNoteId();
                        if (
                            sourceNoteId === null ||
                            blockTaskActionsMenu.blockId === null &&
                            (blockTaskActionsMenu.pos ?? 0) <= 0
                        ) {
                            return;
                        }

                        router.post(
                            '/tasks/migrate',
                            {
                                source_note_id: sourceNoteId,
                                block_id: blockTaskActionsMenu.blockId,
                                position: blockTaskActionsMenu.pos,
                                target_note_id: target.target_note_id ?? null,
                                target_journal_granularity: target.target_journal_granularity ?? null,
                                target_journal_period: target.target_journal_period ?? null,
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

                <BlockLineActionsMenu
                    open={blockLineActionsMenu.open}
                    x={blockLineActionsMenu.x}
                    y={blockLineActionsMenu.y}
                    onClose={() => {
                        setBlockLineActionsMenu((current) => ({
                            ...current,
                            open: false,
                        }));
                    }}
                    onSelect={applyLineAction}
                />
            </>
        );
    }, [
        blockLineActionsMenu.open,
        blockLineActionsMenu.pos,
        blockLineActionsMenu.x,
        blockLineActionsMenu.y,
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
        isEditorActive,
        language,
        linkableNotes,
        mobileKeyboardInset,
        noteId,
        resolveSourceNoteId,
        isMobileViewport,
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
