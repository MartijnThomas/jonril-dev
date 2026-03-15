'use client';

import { Deferred } from '@inertiajs/react';
import type { Editor } from '@tiptap/core';
import { EditorContent, EditorContext, useEditor } from '@tiptap/react';
import { format, isValid, parseISO } from 'date-fns';
import { enUS, nl } from 'date-fns/locale';
import { MapPin, Presentation } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';

import {
    NoteRelatedPanel,
    NoteRelatedPanelPlaceholder,
} from '@/components/note-related-panel';
import { MeetingNotesSidebar } from '@/components/meeting-notes-sidebar';
import { DocumentProperties } from '@/components/tiptap-properties/document-properties';
import type { DocumentPropertiesValue } from '@/components/tiptap-properties/document-properties';
import {
    createEmptyBlockDocument,
    isBlockTreeDocument,
} from '@/components/tiptap-templates/simple/block-tree/block-tree-model';
import { useBlockEditorUi } from '@/components/tiptap-templates/simple/block-tree/use-block-editor-ui';
import { createBlockTreeEditorExtensions } from '@/components/tiptap-templates/simple/block-tree-editor-extensions';
import type {
    SimpleEditorContent,
    SimpleEditorProps,
} from '@/components/tiptap-templates/simple/simple-editor-types';
import { useEditorSave } from '@/components/tiptap-templates/simple/use-editor-save';

import '@/components/tiptap-node/blockquote-node/blockquote-node.scss';
import '@/components/tiptap-node/code-block-node/code-block-node.scss';
import '@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node.scss';
import '@/components/tiptap-node/list-node/list-node.scss';
import '@/components/tiptap-node/image-node/image-node.scss';
import '@/components/tiptap-node/heading-node/heading-node.scss';
import '@/components/tiptap-node/paragraph-node/paragraph-node.scss';

import '@/components/tiptap-templates/simple/simple-editor.scss';
import '@/components/tiptap-templates/simple/styling.css';
import '@/components/tiptap-templates/simple/block-tree/block-editor-only.scss';
const EMPTY_SUGGESTIONS: string[] = [];
const PROPERTY_VISIBILITY_META_PREFIX = '__visible:';

type MeetingEventData = {
    starts_at: string | null;
    ends_at: string | null;
    timezone: string | null;
    location: string | null;
};

function formatMeetingTimeRange(
    startsAt: string | null | undefined,
    endsAt: string | null | undefined,
    language: 'nl' | 'en',
): string | null {
    if (!startsAt) return null;
    const start = parseISO(startsAt);
    if (!isValid(start)) return null;
    const locale = language === 'nl' ? nl : enUS;
    const dateStr = format(start, 'EEEE d MMMM yyyy', { locale });
    const startTime = format(start, 'HH:mm', { locale });
    if (endsAt) {
        const end = parseISO(endsAt);
        if (isValid(end)) {
            return `${dateStr} · ${startTime}–${format(end, 'HH:mm', { locale })}`;
        }
    }
    return `${dateStr} · ${startTime}`;
}

function MeetingEventMeta({ event, language }: { event: MeetingEventData; language: 'nl' | 'en' }) {
    const timeLabel = formatMeetingTimeRange(event.starts_at, event.ends_at, language);
    if (!timeLabel && !event.location) return null;

    return (
        <div className="mt-3 mb-1 flex flex-col gap-1.5 text-sm">
            {timeLabel ? (
                <div className="flex items-start gap-3 text-muted-foreground">
                    <span className="w-16 shrink-0 whitespace-nowrap pt-px text-[0.7rem] font-medium uppercase tracking-wide opacity-60">
                        {language === 'nl' ? 'Wanneer' : 'When'}
                    </span>
                    <span className="text-[0.82rem]">{timeLabel}</span>
                </div>
            ) : null}
            {event.location ? (
                <div className="flex items-center gap-3 text-muted-foreground">
                    <span className="flex w-16 shrink-0 justify-start">
                        <MapPin className="size-3 opacity-60" />
                    </span>
                    <span className="text-[0.82rem]">{event.location}</span>
                </div>
            ) : null}
        </div>
    );
}

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

const resolveEditorSpellcheck = (
    properties: DocumentPropertiesValue,
): boolean => {
    const propertySpellcheck = properties.spellcheck;

    if (typeof propertySpellcheck !== 'string') {
        return true;
    }

    const normalized = propertySpellcheck.trim().toLowerCase();

    if (normalized === '') {
        return true;
    }

    if (
        normalized === 'false' ||
        normalized === '0' ||
        normalized === 'off' ||
        normalized === 'no'
    ) {
        return false;
    }

    if (
        normalized === 'true' ||
        normalized === '1' ||
        normalized === 'on' ||
        normalized === 'yes'
    ) {
        return true;
    }

    return true;
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

function coerceEditorDocument(content: SimpleEditorContent): Record<string, unknown> | null {
    if (content && typeof content === 'object' && !Array.isArray(content)) {
        return content;
    }

    if (typeof content !== 'string' || content.trim() === '') {
        return null;
    }

    try {
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
    } catch {
        return null;
    }

    return null;
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

function SimpleEditorComponent({
    id = '',
    noteUpdateUrl = '',
    content = '',
    properties = {},
    linkableNotes = [],
    workspaceSuggestions,
    relatedTasks = [],
    backlinks = [],
    meetingChildren = [],
    meetingEvent = null,
    showRelatedPanel = false,
    language = 'nl',
    readOnly = false,
    onSaveStatusChange,
    onLastSavedAtChange,
    onContentStatsChange,
    noteType,
    journalGranularity = null,
    journalDate = null,
    defaultTimeblockDurationMinutes = 60,
}: SimpleEditorProps) {
    const isJournal = noteType === 'journal';
    const hasMeetingNotes = meetingChildren.length > 0 && !isJournal;
    // Default open on ≥768 px, closed on small screens. Lazy initializer runs once on mount.
    const [showMeetingNotes, setShowMeetingNotes] = useState(
        () => typeof window === 'undefined' || window.innerWidth >= 768,
    );

    const [documentProperties, setDocumentProperties] =
        useState<DocumentPropertiesValue>(() => ({ ...properties }));
    const [showDocumentProperties, setShowDocumentProperties] = useState(
        hasVisibleProperties(properties),
    );
    const editorSpellcheckEnabled = useMemo(
        () => resolveEditorSpellcheck(documentProperties),
        [documentProperties],
    );
    const mentionSuggestions =
        workspaceSuggestions?.mentions ?? EMPTY_SUGGESTIONS;
    const hashtagSuggestions =
        workspaceSuggestions?.hashtags ?? EMPTY_SUGGESTIONS;

    const previousNoteIdRef = useRef<string | null>(null);
    const previousLoadedContentSerializedRef = useRef<string>('');
    const previewHydrationKeyRef = useRef<string | null>(null);

    const extensions = useMemo(
        () =>
            createBlockTreeEditorExtensions({
                wikiLinkNotes: linkableNotes,
                workspaceSuggestions: {
                    mentions: mentionSuggestions,
                    hashtags: hashtagSuggestions,
                },
                language,
                noteType,
                journalGranularity,
                journalDate,
                defaultTimeblockDurationMinutes,
            }),
        [
            language,
            noteType,
            journalGranularity,
            journalDate,
            defaultTimeblockDurationMinutes,
            linkableNotes,
            mentionSuggestions,
            hashtagSuggestions,
        ],
    );

    const initialContent = useMemo(() => {
        const normalized = coerceEditorDocument(content);

        if (normalized && isBlockTreeDocument(normalized)) {
            return normalized;
        }

        if (normalized && normalized.type === 'doc' && Array.isArray(normalized.content)) {
            return normalized;
        }

        return createEmptyBlockDocument();
    }, [content]);

    const editor = useEditor(
        {
            immediatelyRender: false,
            editorProps: {
                attributes: {
                    autocomplete: 'off',
                    autocorrect: 'on',
                    autocapitalize: 'sentences',
                    spellcheck: editorSpellcheckEnabled ? 'true' : 'false',
                    lang: language,
                    'aria-label': 'Main content area, start typing to enter text.',
                    'data-editor-mode': 'block',
                    class: 'simple-editor',
                },
            },
            editable: !readOnly,
            extensions,
            content: initialContent,
        },
        [id, readOnly, extensions, initialContent],
    );

    useEffect(() => {
        if (!editor) {
            return;
        }

        editor.setEditable(!readOnly, false);
    }, [editor, readOnly]);

    const { blockUi } = useBlockEditorUi({
        editor,
        noteId: id,
        language,
        linkableNotes,
        workspaceSuggestions: {
            mentions: mentionSuggestions,
            hashtags: hashtagSuggestions,
        },
    });

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
        window.dispatchEvent(new CustomEvent('meeting-notes-state', {
            detail: { hasMeetingNotes, showMeetingNotes, count: meetingChildren.length },
        }));
    }, [hasMeetingNotes, showMeetingNotes]);

    useEffect(() => {
        const handleToggle = () => {
            if (hasMeetingNotes) {
                setShowMeetingNotes((current) => !current);
            }
        };

        window.addEventListener('meeting-notes-toggle-request', handleToggle);

        return () => {
            window.removeEventListener('meeting-notes-toggle-request', handleToggle);
        };
    }, [hasMeetingNotes]);

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
            // Never replace the current focused document for same-note updates in editable mode,
            // otherwise selection jumps to the end during autosave.
            // In read-only preview we still want to accept the new incoming content.
            if (editor.isFocused && !readOnly) {
                return;
            }

            if (!hasEquivalentEditorDocument(editor, initialContent)) {
                editor.commands.setContent(initialContent, { emitUpdate: false });
            }
        }
    }, [editor, id, initialContent, readOnly]);

    useEffect(() => {
        if (!editor || !readOnly) {
            return;
        }

        const hydrationKey = `${id}:${serializeEditorContent(initialContent)}`;
        if (previewHydrationKeyRef.current === hydrationKey) {
            return;
        }

        previewHydrationKeyRef.current = hydrationKey;
        editor.commands.setContent(initialContent, { emitUpdate: false });
    }, [editor, id, initialContent, readOnly]);

    useEffect(() => {
        if (!editor) {
            return;
        }

        editor.view.dom.setAttribute('lang', language);
        editor.view.dom.setAttribute(
            'spellcheck',
            editorSpellcheckEnabled ? 'true' : 'false',
        );
    }, [editor, language, editorSpellcheckEnabled]);

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
        if (!editor) {
            return;
        }

        const withEditorDom = (callback: (dom: HTMLElement) => void) => {
            try {
                const dom = editor.view?.dom;
                if (dom instanceof HTMLElement) {
                    callback(dom);
                }
            } catch {
                // Editor view may not be mounted during lifecycle transitions.
            }
        };

        const updateWikiLinkEditClass = () => {
            withEditorDom((dom) => {
                const isEditingWikiLink = editor.isActive('wikiLink');
                dom.classList.toggle('md-wikilink-edit-active', isEditingWikiLink);
            });
        };

        updateWikiLinkEditClass();
        editor.on('selectionUpdate', updateWikiLinkEditClass);
        editor.on('focus', updateWikiLinkEditClass);
        editor.on('blur', updateWikiLinkEditClass);

        return () => {
            editor.off('selectionUpdate', updateWikiLinkEditClass);
            editor.off('focus', updateWikiLinkEditClass);
            editor.off('blur', updateWikiLinkEditClass);
            withEditorDom((dom) => {
                dom.classList.remove('md-wikilink-edit-active');
            });
        };
    }, [editor]);

    const { status, saveEditor, lastSavedAt } = useEditorSave({
        editor,
        enabled: !readOnly,
        noteId: id,
        noteUpdateUrl,
        properties: documentProperties,
        idleMs: 1500,
        includeTimeblocks: noteType === 'journal' && journalGranularity === 'daily' && typeof journalDate === 'string' && journalDate.trim() !== '',
        saveTransport: 'json',
    });

    useEffect(() => {
        onSaveStatusChange?.(status);
    }, [onSaveStatusChange, status]);

    useEffect(() => {
        onLastSavedAtChange?.(lastSavedAt);
    }, [lastSavedAt, onLastSavedAtChange]);

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
            const currentParent = editor.state.selection.$from.parent;
            const currentBlockIndent =
                currentParent.type.name === 'paragraph'
                    ? Math.max(0, Number(currentParent.attrs.indent ?? 0))
                    : 0;
            const currentBlockKind =
                currentParent.type.name === 'heading'
                    ? `h${Math.min(6, Math.max(1, Number(currentParent.attrs.level ?? 1)))}`
                    : currentParent.type.name === 'paragraph'
                      ? (() => {
                            const blockStyle = String(
                                currentParent.attrs.blockStyle ?? 'paragraph',
                            ).trim();

                            if (blockStyle === 'quote') {
                                return 'blockquote';
                            }

                            return blockStyle !== '' ? blockStyle : 'paragraph';
                        })()
                      : currentParent.type.name;
            const currentCursorPosition = editor.state.selection.$from.parentOffset;

            editor.state.doc.descendants((node) => {
                const isLegacyTask = node.type.name === 'taskItem';
                const isBlockTask =
                    node.type.name === 'paragraph' &&
                    node.attrs.blockStyle === 'task';

                if (!isLegacyTask && !isBlockTask) {
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
                indent: currentBlockIndent,
                position: currentCursorPosition,
                kind: currentBlockKind,
            });
        };

        emit();
        editor.on('update', emit);
        editor.on('selectionUpdate', emit);

        return () => {
            editor.off('update', emit);
            editor.off('selectionUpdate', emit);
        };
    }, [editor, onContentStatsChange]);

    return (
        <div className="flex w-full min-h-0">
            <div className="flex-1 min-w-0">
                <EditorContext.Provider value={{ editor }}>
                    {!readOnly ? blockUi : null}
                    {showRelatedPanel ? (
                        <div className="w-full md:mx-auto md:mt-4 md:max-w-3xl md:px-8">
                            <Deferred
                                data={['relatedTasks', 'backlinks']}
                                fallback={<NoteRelatedPanelPlaceholder language={language} />}
                            >
                                <NoteRelatedPanel
                                    noteId={id}
                                    key={id}
                                    relatedTasks={relatedTasks}
                                    backlinks={backlinks}
                                    language={language}
                                />
                            </Deferred>
                        </div>
                    ) : null}

                    {!readOnly && showDocumentProperties ? (
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
                        <div className="px-8">
                            {meetingEvent && noteType === 'meeting' ? (
                                <MeetingEventMeta event={meetingEvent} language={language} />
                            ) : null}
                            <EditorContent
                                editor={editor}
                                role="presentation"
                                className="simple-editor-content mt-4 md:mt-8"
                            />
                        </div>
                    </div>
                </EditorContext.Provider>

            </div>

            {hasMeetingNotes && showMeetingNotes ? (
                <MeetingNotesSidebar
                    meetingNotes={meetingChildren}
                    language={language}
                    currentNoteId={id}
                    onClose={() => setShowMeetingNotes(false)}
                />
            ) : null}
        </div>
    );
}

export const SimpleEditorBlock = memo(SimpleEditorComponent);
