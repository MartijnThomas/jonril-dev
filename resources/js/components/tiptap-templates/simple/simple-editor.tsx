'use client';

import { Deferred, router } from '@inertiajs/react';
import type { Editor } from '@tiptap/core';
import { EditorContent, EditorContext, useEditor } from '@tiptap/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
    NoteRelatedPanel,
    NoteRelatedPanelPlaceholder,
} from '@/components/note-related-panel';
import { TaskMigratePicker } from '@/components/task-migrate-picker';
import { NOTE_TITLE_ICON_PLUGIN_KEY } from '@/components/tiptap-extension/note-title-icon-extension';
import { DocumentProperties } from '@/components/tiptap-properties/document-properties';
import type { DocumentPropertiesValue } from '@/components/tiptap-properties/document-properties';
import {
    EditorBubbleToolbar,
    MobileEditorToolbar,
} from '@/components/tiptap-templates/simple/editor-toolbar';
import { createSimpleEditorExtensions } from '@/components/tiptap-templates/simple/simple-editor-extensions';
import { useEditorSave } from '@/components/tiptap-templates/simple/use-editor-save';
import { useIsBreakpoint } from '@/hooks/use-is-breakpoint';
import { sanitizeIconStyleToken } from '@/lib/icon-style';
import type { EditorSaveStatus } from '@/types';

import '@/components/tiptap-node/blockquote-node/blockquote-node.scss';
import '@/components/tiptap-node/code-block-node/code-block-node.scss';
import '@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node.scss';
import '@/components/tiptap-node/list-node/list-node.scss';
import '@/components/tiptap-node/image-node/image-node.scss';
import '@/components/tiptap-node/heading-node/heading-node.scss';
import '@/components/tiptap-node/paragraph-node/paragraph-node.scss';

import '@/components/tiptap-templates/simple/simple-editor.scss';
import '@/components/tiptap-templates/simple/styling.css';

type SimpleEditorContent = string | Record<string, any> | null;
const EMPTY_SUGGESTIONS: string[] = [];
const PROPERTY_VISIBILITY_META_PREFIX = '__visible:';

const isPropertyVisibilityMetaKey = (key: string) =>
    key.startsWith(PROPERTY_VISIBILITY_META_PREFIX);

const isDefaultVisibleProperty = (key: string) => {
    const normalized = key.trim().toLowerCase();
    return normalized === 'context' || normalized === 'tags';
};

const hasVisibleProperties = (properties: DocumentPropertiesValue): boolean => {
    for (const [key, propertyValue] of Object.entries(properties)) {
        if (isPropertyVisibilityMetaKey(key)) {
            continue;
        }

        if (typeof propertyValue !== 'string' || propertyValue.trim() === '') {
            continue;
        }

        const metaValue =
            properties[`${PROPERTY_VISIBILITY_META_PREFIX}${key}`];
        const isVisible = metaValue === '1'
            ? true
            : metaValue === '0'
                ? false
                : isDefaultVisibleProperty(key);

        if (isVisible) {
            return true;
        }
    }

    return false;
};

function serializeEditorContent(content: SimpleEditorContent): string {
    if (typeof content === 'string') {
        return content;
    }

    if (content && typeof content === 'object') {
        try {
            return JSON.stringify(content);
        } catch {
            return '';
        }
    }

    return '';
}

function hasEquivalentEditorDocument(
    editor: Editor,
    content: SimpleEditorContent,
): boolean {
    if (!content || typeof content !== 'object' || Array.isArray(content)) {
        return false;
    }

    if (!('type' in content)) {
        return false;
    }

    try {
        return editor.schema.nodeFromJSON(content).eq(editor.state.doc);
    } catch {
        return false;
    }
}

type SimpleEditorProps = {
    id: string;
    noteUpdateUrl: string;
    content?: SimpleEditorContent;
    properties?: DocumentPropertiesValue;
    linkableNotes?: {
        id: string;
        title: string;
        path?: string;
        href?: string;
    }[];
    workspaceSuggestions?: {
        mentions: string[];
        hashtags: string[];
    };
    relatedTasks?: {
        id: number;
        note_id: string;
        block_id: string | null;
        position: number;
        checked: boolean;
        content: string;
        render_fragments: {
            type:
                | 'text'
                | 'mention'
                | 'hashtag'
                | 'wikilink'
                | 'due_date_token'
                | 'deadline_date_token'
                | 'status_token';
            text?: string;
            label?: string;
            note_id?: string | null;
            href?: string | null;
            date?: string;
            value?: string;
            status?:
                | 'canceled'
                | 'assigned'
                | 'in_progress'
                | 'migrated'
                | 'deferred'
                | 'starred'
                | 'backlog'
                | null;
        }[];
        task_status?:
            | 'canceled'
            | 'assigned'
            | 'in_progress'
            | 'migrated'
            | 'deferred'
            | 'starred'
            | 'backlog'
            | null;
        due_date: string | null;
        deadline_date: string | null;
        note: {
            id: string;
            title: string;
            href: string;
        };
    }[];
    backlinks?: {
        id: string;
        block_id: string;
        excerpt: string;
        render_fragments: {
            type:
                | 'text'
                | 'mention'
                | 'hashtag'
                | 'wikilink'
                | 'due_date_token'
                | 'deadline_date_token'
                | 'status_token';
            text?: string;
            label?: string;
            note_id?: string | null;
            href?: string | null;
            date?: string;
            value?: string;
            status?:
                | 'canceled'
                | 'assigned'
                | 'in_progress'
                | 'migrated'
                | 'deferred'
                | 'starred'
                | 'backlog'
                | null;
        }[];
        note: {
            id: string;
            title: string;
            href: string;
        };
        href: string;
    }[];
    showRelatedPanel?: boolean;
    language?: 'nl' | 'en';
    noteType?: string | null;
    journalGranularity?: string | null;
    journalDate?: string | null;
    defaultTimeblockDurationMinutes?: number;
    onSaveStatusChange?: (status: EditorSaveStatus) => void;
    onLastSavedAtChange?: (timestamp: number | null) => void;
    onDebugJsonChange?: (json: string) => void;
    onContentStatsChange?: (stats: {
        words: number;
        characters: number;
        tasksTotal: number;
        tasksClosed: number;
        tasksCompleted: number;
        tasksCanceled: number;
        tasksMigrated: number;
        tasksOpen: number;
    }) => void;
};

export function SimpleEditor({
    id,
    noteUpdateUrl,
    content = '',
    properties = {},
    linkableNotes = [],
    workspaceSuggestions,
    relatedTasks = [],
    backlinks = [],
    showRelatedPanel = false,
    language = 'nl',
    noteType = null,
    journalGranularity = null,
    journalDate = null,
    defaultTimeblockDurationMinutes = 60,
    onSaveStatusChange,
    onLastSavedAtChange,
    onDebugJsonChange,
    onContentStatsChange,
}: SimpleEditorProps) {
    const isMobileBreakpoint = useIsBreakpoint();
    const isMobile =
        isMobileBreakpoint &&
        (typeof window === 'undefined' ? true : window.innerWidth < 768);

    const [mobileView, setMobileView] = useState<
        'main' | 'highlighter' | 'link'
    >('main');
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

    const [documentProperties, setDocumentProperties] =
        useState<DocumentPropertiesValue>(properties);
    const [showDocumentProperties, setShowDocumentProperties] = useState(
        hasVisibleProperties(properties),
    );
    const noteIconProp = documentProperties.icon;
    const noteIconColorProp = documentProperties['icon-color'];
    const noteIconBgProp = documentProperties['icon-bg'];
    const mentionSuggestions =
        workspaceSuggestions?.mentions ?? EMPTY_SUGGESTIONS;
    const hashtagSuggestions =
        workspaceSuggestions?.hashtags ?? EMPTY_SUGGESTIONS;

    const toolbarRef = useRef<HTMLDivElement>(null);
    const previousNoteIdRef = useRef<string | null>(null);
    const previousLoadedContentSerializedRef = useRef<string>('');

    const extensions = useMemo(
        () =>
            createSimpleEditorExtensions({
                wikiLinkNotes: linkableNotes,
                workspaceSuggestions: {
                    mentions: mentionSuggestions,
                    hashtags: hashtagSuggestions,
                },
                language,
                noteIcon:
                    typeof noteIconProp === 'string'
                        ? noteIconProp
                        : null,
                noteIconColor: sanitizeIconStyleToken(noteIconColorProp),
                noteIconBg: sanitizeIconStyleToken(noteIconBgProp),
                noteType,
                journalGranularity,
                journalDate,
                defaultTimeblockDurationMinutes,
            }),
        [
            defaultTimeblockDurationMinutes,
            journalDate,
            journalGranularity,
            noteIconBgProp,
            noteIconColorProp,
            noteIconProp,
            noteType,
            language,
            linkableNotes,
            mentionSuggestions,
            hashtagSuggestions,
        ],
    );

    const initialContent = useMemo(() => {
        if (typeof content === 'string') {
            return content;
        }

        if (
            content &&
            typeof content === 'object' &&
            !Array.isArray(content) &&
            'type' in content
        ) {
            return content;
        }

        return '';
    }, [content]);

    const editor = useEditor({
        immediatelyRender: false,
        editorProps: {
            attributes: {
                autocomplete: 'off',
                autocorrect: 'on',
                autocapitalize: 'sentences',
                spellcheck: 'true',
                'aria-label': 'Main content area, start typing to enter text.',
                class: 'simple-editor',
            },
        },
        extensions,
        contentType: 'json',
        content: initialContent,
    });

    useEffect(() => {
        setDocumentProperties(properties);
        setShowDocumentProperties(hasVisibleProperties(properties));
    }, [id, properties]);

    useEffect(() => {
        const handlePropertiesToggleRequest = () => {
            setShowDocumentProperties((current) => !current);
        };

        window.addEventListener(
            'note-properties-toggle-request',
            handlePropertiesToggleRequest,
        );

        return () => {
            window.removeEventListener(
                'note-properties-toggle-request',
                handlePropertiesToggleRequest,
            );
        };
    }, []);

    useEffect(() => {
        window.dispatchEvent(new CustomEvent('note-properties-visibility-state', {
            detail: { visible: showDocumentProperties },
        }));
    }, [showDocumentProperties]);

    useEffect(() => {
        if (!editor) {
            return;
        }

        const incomingSerialized = serializeEditorContent(initialContent);

        if (previousNoteIdRef.current === null) {
            previousNoteIdRef.current = id;
            previousLoadedContentSerializedRef.current = incomingSerialized;
            return;
        }

        const noteChanged = previousNoteIdRef.current !== id;
        const contentChanged =
            previousLoadedContentSerializedRef.current !== incomingSerialized;

        if (noteChanged || contentChanged) {
            previousNoteIdRef.current = id;
            previousLoadedContentSerializedRef.current = incomingSerialized;

            if (noteChanged) {
                editor.commands.setContent(initialContent, { emitUpdate: false });
                return;
            }

            // Staging can normalize/reshape JSON on save responses.
            // Never replace the current focused document for same-note updates,
            // otherwise selection jumps to the end during autosave.
            if (editor.isFocused) {
                return;
            }

            if (!hasEquivalentEditorDocument(editor, initialContent)) {
                editor.commands.setContent(initialContent, { emitUpdate: false });
            }
        }
    }, [editor, id, initialContent]);

    useEffect(() => {
        if (!editor) {
            return;
        }

        const handleFocusShortcut = (event: KeyboardEvent) => {
            const isFocusShortcut =
                (event.metaKey || event.ctrlKey) &&
                event.shiftKey &&
                event.key.toLowerCase() === 'e';

            if (!isFocusShortcut || event.defaultPrevented || event.isComposing) {
                return;
            }

            event.preventDefault();

            requestAnimationFrame(() => {
                if (!editor.isDestroyed) {
                    editor.commands.focus();
                }
            });
        };

        window.addEventListener('keydown', handleFocusShortcut);

        return () => {
            window.removeEventListener('keydown', handleFocusShortcut);
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
        if (!editor) {
            return;
        }

        // eslint-disable-next-line react-hooks/immutability
        editor.isMobile = isMobile;
    }, [editor, isMobile]);

    useEffect(() => {
        if (!editor) {
            return;
        }

        const updateWikiLinkEditClass = () => {
            const dom = editor.view.dom as HTMLElement;
            const isEditingWikiLink = editor.isActive('wikiLink');
            dom.classList.toggle('md-wikilink-edit-active', isEditingWikiLink);
        };

        updateWikiLinkEditClass();
        editor.on('selectionUpdate', updateWikiLinkEditClass);
        editor.on('focus', updateWikiLinkEditClass);
        editor.on('blur', updateWikiLinkEditClass);

        return () => {
            editor.off('selectionUpdate', updateWikiLinkEditClass);
            editor.off('focus', updateWikiLinkEditClass);
            editor.off('blur', updateWikiLinkEditClass);
            (editor.view.dom as HTMLElement).classList.remove(
                'md-wikilink-edit-active',
            );
        };
    }, [editor]);

    useEffect(() => {
        if (!isMobile && mobileView !== 'main') {
            setMobileView('main');
        }
    }, [isMobile, mobileView]);

    const { status, saveEditor, lastSavedAt } = useEditorSave({
        editor,
        noteId: id,
        noteUpdateUrl,
        properties: documentProperties,
        idleMs: 1500,
        includeTimeblocks:
            noteType === 'journal' &&
            journalGranularity === 'daily' &&
            typeof journalDate === 'string' &&
            journalDate.trim() !== '',
    });

    useEffect(() => {
        onSaveStatusChange?.(status);
    }, [onSaveStatusChange, status]);

    useEffect(() => {
        onLastSavedAtChange?.(lastSavedAt);
    }, [lastSavedAt, onLastSavedAtChange]);

    useEffect(() => {
        if (!editor || !onDebugJsonChange) {
            return;
        }

        const emit = () => {
            onDebugJsonChange(
                JSON.stringify(
                    {
                        content: editor.getJSON(),
                        timeblocks: editor.storage.timeblock?.timeblocks ?? [],
                    },
                    null,
                    2,
                ),
            );
        };

        emit();
        editor.on('update', emit);

        return () => {
            editor.off('update', emit);
        };
    }, [editor, onDebugJsonChange]);

    useEffect(() => {
        if (!editor || !onContentStatsChange) {
            return;
        }

        const emit = () => {
            const words =
                editor.storage.characterCount?.words?.() ??
                editor.getText().trim().split(/\s+/).filter(Boolean).length;
            const characters =
                editor.storage.characterCount?.characters?.() ??
                editor.getText().length;

            let tasksTotal = 0;
            let tasksClosed = 0;
            let tasksCompleted = 0;
            let tasksCanceled = 0;
            let tasksMigrated = 0;
            let tasksOpen = 0;

            editor.state.doc.descendants((node) => {
                if (node.type.name !== 'taskItem') {
                    return true;
                }

                tasksTotal += 1;
                const isCanceled = node.attrs.taskStatus === 'canceled';
                const isMigrated = node.attrs.taskStatus === 'migrated';
                const isCompleted = node.attrs.checked === true;

                if (isCanceled) {
                    tasksCanceled += 1;
                } else if (isMigrated) {
                    tasksMigrated += 1;
                } else if (isCompleted) {
                    tasksCompleted += 1;
                } else {
                    tasksOpen += 1;
                }

                if (isCompleted || isCanceled || isMigrated) {
                    tasksClosed += 1;
                }

                return true;
            });

            onContentStatsChange({
                words,
                characters,
                tasksTotal,
                tasksClosed,
                tasksCompleted,
                tasksCanceled,
                tasksMigrated,
                tasksOpen,
            });
        };

        emit();
        editor.on('update', emit);

        return () => {
            editor.off('update', emit);
        };
    }, [editor, onContentStatsChange]);

    useEffect(() => {
        if (!editor) {
            return;
        }
        const iconName =
            typeof noteIconProp === 'string' &&
            noteIconProp.trim() !== ''
                ? noteIconProp.trim()
                : null;
        const iconColor = sanitizeIconStyleToken(noteIconColorProp);
        const iconBg = sanitizeIconStyleToken(noteIconBgProp);

        const transaction = editor.state.tr.setMeta(
            NOTE_TITLE_ICON_PLUGIN_KEY,
            {
                iconName,
                iconColor: iconColor.startsWith('text-') ? iconColor : null,
                iconBg: iconBg.startsWith('bg-') ? iconBg : null,
            },
        );
        editor.view.dispatch(transaction);

    }, [
        noteIconBgProp,
        noteIconColorProp,
        noteIconProp,
        editor,
    ]);

    return (
        <div className="w-full">
            <EditorContext.Provider value={{ editor }}>
                <TaskMigratePicker
                    open={taskMigratePicker.open}
                    sourceNoteId={id}
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
                        router.reload({
                            only: ['content', 'relatedTasks', 'backlinks'],
                            preserveScroll: true,
                            preserveState: false,
                        });
                    }}
                />
                {showRelatedPanel ? (
                    <div className="w-full md:mx-auto md:mt-4 md:max-w-3xl md:px-8">
                        <Deferred
                            data={['relatedTasks', 'backlinks']}
                            fallback={<NoteRelatedPanelPlaceholder language={language} />}
                        >
                            <NoteRelatedPanel
                                key={id}
                                relatedTasks={relatedTasks}
                                backlinks={backlinks}
                                language={language}
                            />
                        </Deferred>
                    </div>
                ) : null}

                {showDocumentProperties ? (
                    <div className="w-full md:mx-auto md:max-w-3xl md:px-8">
                        <div className="pt-0 md:pt-1">
                            <DocumentProperties
                                value={documentProperties}
                                onChange={setDocumentProperties}
                                onPersistRequested={() => {
                                    requestAnimationFrame(() => {
                                        saveEditor(false);
                                    });
                                }}
                                workspaceSuggestions={{
                                    mentions: mentionSuggestions,
                                    hashtags: hashtagSuggestions,
                                }}
                            />
                        </div>
                    </div>
                ) : null}

                <div className="mx-auto w-full max-w-3xl">
                    {editor && !isMobile && <EditorBubbleToolbar editor={editor} />}

                    {isMobile && (
                        <MobileEditorToolbar
                            mobileView={mobileView}
                            onBack={() => setMobileView('main')}
                            onHighlighterClick={() => setMobileView('highlighter')}
                            onLinkClick={() => setMobileView('link')}
                            onCommandPaletteClick={() => {
                                window.dispatchEvent(
                                    new Event('open-command-palette'),
                                );
                            }}
                            toolbarRef={toolbarRef}
                        />
                    )}

                    <div className="px-8">
                        <EditorContent
                            editor={editor}
                            role="presentation"
                            className="simple-editor-content mt-4 md:mt-8"
                        />
                    </div>
                </div>
            </EditorContext.Provider>
        </div>
    );
}
