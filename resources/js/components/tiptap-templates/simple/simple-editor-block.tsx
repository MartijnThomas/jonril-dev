'use client';

import { Deferred } from '@inertiajs/react';
import type { Editor } from '@tiptap/core';
import { EditorContent, EditorContext, useEditor } from '@tiptap/react';
import { format, isValid, parseISO } from 'date-fns';
import { enUS, nl } from 'date-fns/locale';
import { Plus } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import {
    NoteRelatedPanel,
    NoteRelatedPanelPlaceholder,
} from '@/components/note-related-panel';
import { DocumentProperties } from '@/components/tiptap-properties/document-properties';
import { TokenPropertyInput } from '@/components/tiptap-properties/document-properties';
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
import { useEditorVersion } from '@/contexts/editor-version-context';
import { createBlockNoteImageUploadHandler } from '@/lib/block-note-image-upload';

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
const DEFERRED_RELATED_DATA = ['relatedTasks', 'backlinks'] as const;
const PROPERTY_VISIBILITY_META_PREFIX = '__visible:';

type WindowWithBlockImageUpload = Window & {
    __blockNoteImageUploadHandler?: ReturnType<typeof createBlockNoteImageUploadHandler>;
    __blockNoteImageUploadTestStub?: (file: File) => Promise<string>;
    __blockNoteImageInsertDataUrlForTest?: (dataUrl: string) => Promise<boolean>;
};

type MeetingEventData = {
    starts_at: string | null;
    ends_at: string | null;
    timezone: string | null;
    location: string | null;
};

function parseParticipants(value: string | null | undefined): string[] {
    if (!value) {
        return [];
    }

    return value
        .split(',')
        .map((entry) => entry.trim().replace(/^@/, ''))
        .filter((entry) => entry !== '');
}

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

function MeetingEventMeta({
    event,
    language,
    participantsValue,
    participantOptions,
    onParticipantsChange,
    onPersistParticipant,
}: {
    event: MeetingEventData;
    language: 'nl' | 'en';
    participantsValue: string;
    participantOptions: string[];
    onParticipantsChange: (value: string) => void;
    onPersistParticipant: (value: string) => Promise<string[]>;
}) {
    const participantInputRef = useRef<HTMLInputElement | null>(null);
    const participants = parseParticipants(participantsValue);
    const timeLabel = formatMeetingTimeRange(event.starts_at, event.ends_at, language);
    const shouldRenderMeta = Boolean(timeLabel || event.location || participants.length > 0);

    if (!shouldRenderMeta) return null;

    return (
        <div className="mt-3 mb-1 flex flex-col gap-1.5 text-sm">
            {timeLabel ? (
                <div className="flex items-baseline gap-3 text-muted-foreground">
                    <span className="w-16 shrink-0 whitespace-nowrap text-[0.7rem] font-medium uppercase tracking-wide opacity-60">
                        {language === 'nl' ? 'Wanneer' : 'When'}
                    </span>
                    <span className="text-[0.82rem]">{timeLabel}</span>
                </div>
            ) : null}
            {event.location ? (
                <div className="flex items-baseline gap-3 text-muted-foreground">
                    <span className="w-16 shrink-0 whitespace-nowrap text-[0.7rem] font-medium uppercase tracking-wide opacity-60">
                        {language === 'nl' ? 'Waar' : 'Where'}
                    </span>
                    <span className="text-[0.82rem]">{event.location}</span>
                </div>
            ) : null}
            <div className="flex items-start gap-3 text-muted-foreground">
                <span className="w-16 shrink-0 whitespace-nowrap pt-1 text-[0.7rem] font-medium uppercase tracking-wide opacity-60">
                    {language === 'nl' ? 'Wie' : 'Who'}
                </span>
                <div className="min-w-0 flex-1">
                    <div
                        data-testid="meeting-participants-row"
                        className="flex flex-wrap items-start gap-1"
                    >
                        <TokenPropertyInput
                            mode="participants"
                            inputRef={(element) => {
                                participantInputRef.current = element;
                            }}
                            value={participantsValue}
                            onChange={onParticipantsChange}
                            onPersist={async (_kind, value) =>
                                onPersistParticipant(value)
                            }
                            options={participantOptions}
                            placeholder={
                                language === 'nl'
                                    ? '+ deelnemers toevoegen'
                                    : '+ add participants'
                            }
                            className="!h-auto min-h-8 !w-auto max-w-full rounded-sm bg-muted/30 px-1 py-1 text-[0.82rem]"
                        />
                        <button
                            type="button"
                            onClick={() => participantInputRef.current?.focus()}
                            className="inline-flex items-center gap-1 rounded-sm px-1 py-0.5 text-xs text-muted-foreground/80 hover:bg-muted hover:text-foreground"
                            aria-label={language === 'nl' ? 'Deelnemer toevoegen' : 'Add participant'}
                        >
                            <Plus className="size-3" />
                        </button>
                    </div>
                </div>
            </div>
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
    noteHashUrl,
    contentHash,
    noteImageUploadUrl = '',
    content = '',
    properties = {},
    linkableNotes = [],
    workspaceSuggestions,
    relatedTasks = [],
    backlinks = [],
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
    timeblockSyncByBlockId = {},
    defaultTimeblockDurationMinutes = 60,
}: SimpleEditorProps) {
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const { setVersion } = useEditorVersion();
    useEffect(() => {
        if (noteHashUrl && contentHash) {
            setVersion({ hashUrl: noteHashUrl, contentHash });
        }
        return () => setVersion(null);
    }, [noteHashUrl, contentHash, setVersion]);

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
    const [meetingParticipantOptionsOverride, setMeetingParticipantOptionsOverride] = useState<string[] | null>(null);
    const meetingParticipantOptions = meetingParticipantOptionsOverride ?? mentionSuggestions;
    const [mobileKeyboardInset, setMobileKeyboardInset] = useState(0);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const isMobileViewport = window.matchMedia('(max-width: 767px)').matches;
        if (!isMobileViewport) {
            return;
        }

        const updateKeyboardInset = () => {
            const viewport = window.visualViewport;
            if (!viewport) {
                setMobileKeyboardInset(0);
                return;
            }

            const viewportBottom = viewport.height + viewport.offsetTop;
            const keyboardInset = Math.max(0, Math.round(window.innerHeight - viewportBottom));
            setMobileKeyboardInset(keyboardInset > 32 ? keyboardInset : 0);
        };

        updateKeyboardInset();
        window.visualViewport?.addEventListener('resize', updateKeyboardInset);
        window.visualViewport?.addEventListener('scroll', updateKeyboardInset);
        window.addEventListener('orientationchange', updateKeyboardInset);

        return () => {
            window.visualViewport?.removeEventListener('resize', updateKeyboardInset);
            window.visualViewport?.removeEventListener('scroll', updateKeyboardInset);
            window.removeEventListener('orientationchange', updateKeyboardInset);
        };
    }, []);

    const mobileScrollInsetStyle = useMemo<CSSProperties>(() => {
        const baseBottomInset = 132;
        const dynamicInset = mobileKeyboardInset > 0 ? mobileKeyboardInset : 0;
        const totalInset = baseBottomInset + dynamicInset;

        return {
            paddingBottom: `calc(${totalInset}px + env(safe-area-inset-bottom, 0px))`,
            scrollPaddingBottom: `calc(${totalInset}px + env(safe-area-inset-bottom, 0px))`,
        };
    }, [mobileKeyboardInset]);

    const getCookie = (name: string): string | null => {
        const match = document.cookie
            .split('; ')
            .find((part) => part.startsWith(`${name}=`));

        if (!match) {
            return null;
        }

        return decodeURIComponent(match.split('=').slice(1).join('='));
    };

    const persistMeetingParticipantSuggestion = async (
        rawValue: string,
    ): Promise<string[]> => {
        const normalized = rawValue.trim().replace(/^@/, '').trim();
        if (normalized === '') {
            return meetingParticipantOptions;
        }

        const xsrfToken = getCookie('XSRF-TOKEN');
        const response = await fetch('/workspaces/suggestions', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                ...(xsrfToken ? { 'X-XSRF-TOKEN': xsrfToken } : {}),
            },
            body: JSON.stringify({
                kind: 'mention',
                value: normalized,
            }),
        });

        if (!response.ok) {
            return meetingParticipantOptions;
        }

        const payload = (await response.json()) as { items?: string[] };
        const items = Array.isArray(payload.items) ? payload.items : [];
        setMeetingParticipantOptionsOverride(items);

        return items;
    };

    const previousNoteIdRef = useRef<string | null>(null);
    const previousLoadedContentSerializedRef = useRef<string>('');
    const previewHydrationKeyRef = useRef<string | null>(null);
    const imageUploadHandler = useMemo(() => {
        if (typeof window !== 'undefined') {
            const testStub = (window as WindowWithBlockImageUpload).__blockNoteImageUploadTestStub;
            if (typeof testStub === 'function') {
                return async (file: File, onProgress) => {
                    onProgress?.({ progress: 100 });
                    return testStub(file);
                };
            }
        }

        const uploadUrl = noteImageUploadUrl.trim();
        if (uploadUrl === '') {
            return undefined;
        }

        return createBlockNoteImageUploadHandler(uploadUrl, id);
    }, [id, noteImageUploadUrl]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const typedWindow = window as WindowWithBlockImageUpload;
        typedWindow.__blockNoteImageUploadHandler = imageUploadHandler;

        return () => {
            if (typedWindow.__blockNoteImageUploadHandler === imageUploadHandler) {
                delete typedWindow.__blockNoteImageUploadHandler;
            }
        };
    }, [imageUploadHandler]);

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
                timeblockSyncByBlockId,
                defaultTimeblockDurationMinutes,
                imageUploadHandler,
            }),
        [
            language,
            noteType,
            journalGranularity,
            journalDate,
            timeblockSyncByBlockId,
            defaultTimeblockDurationMinutes,
            linkableNotes,
            mentionSuggestions,
            hashtagSuggestions,
            imageUploadHandler,
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
                    'data-note-id': id,
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

    useEffect(() => {
        if (!editor || typeof window === 'undefined') {
            return;
        }

        const isMobileViewport = window.matchMedia('(max-width: 767px)').matches;
        if (!isMobileViewport) {
            return;
        }

        const ensureSelectionInTopHalf = () => {
            if (editor.isDestroyed || !editor.isFocused) {
                return;
            }

            const scrollContainer = scrollContainerRef.current;
            if (!scrollContainer) {
                return;
            }

            try {
                const selectionFrom = editor.state.selection.from;
                const coords = editor.view.coordsAtPos(selectionFrom);
                const viewport = window.visualViewport;
                const viewportTop = viewport?.offsetTop ?? 0;
                const viewportHeight = viewport?.height ?? window.innerHeight;
                const desiredLineY = viewportTop + viewportHeight * 0.42;
                const delta = coords.top - desiredLineY;

                if (delta > 14) {
                    scrollContainer.scrollBy({
                        top: delta,
                        left: 0,
                        behavior: 'smooth',
                    });
                }
            } catch {
                // Editor view can be temporarily unavailable during remounts.
            }
        };

        const scheduleEnsureSelectionInTopHalf = () => {
            window.requestAnimationFrame(() => {
                ensureSelectionInTopHalf();
            });
        };

        editor.on('focus', scheduleEnsureSelectionInTopHalf);
        editor.on('selectionUpdate', scheduleEnsureSelectionInTopHalf);

        return () => {
            editor.off('focus', scheduleEnsureSelectionInTopHalf);
            editor.off('selectionUpdate', scheduleEnsureSelectionInTopHalf);
        };
    }, [editor]);

    useEffect(() => {
        if (typeof window === 'undefined' || !editor || !imageUploadHandler) {
            return;
        }

        const typedWindow = window as WindowWithBlockImageUpload;
        typedWindow.__blockNoteImageInsertDataUrlForTest = async (dataUrl: string) => {
            const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
            if (!match) {
                return false;
            }

            const mimeType = match[1];
            const base64Content = match[2];

            let bytes: Uint8Array;
            try {
                const binary = atob(base64Content);
                bytes = new Uint8Array(binary.length);
                for (let index = 0; index < binary.length; index += 1) {
                    bytes[index] = binary.charCodeAt(index);
                }
            } catch {
                return false;
            }

            const extension = mimeType.split('/')[1] ?? 'png';
            const file = new File([bytes], `pasted-image-test.${extension}`, {
                type: mimeType,
            });

            try {
                const testStub = typedWindow.__blockNoteImageUploadTestStub;
                const uploadedUrl = typeof testStub === 'function'
                    ? await testStub(file)
                    : await imageUploadHandler(file);
                const trimmedUrl = uploadedUrl.trim();
                if (trimmedUrl === '') {
                    return false;
                }

                editor
                    .chain()
                    .focus()
                    .insertContent({
                        type: 'image',
                        attrs: {
                            src: trimmedUrl,
                            alt: 'pasted-image-test',
                            title: 'pasted-image-test',
                        },
                    })
                    .run();

                return true;
            } catch {
                return false;
            }
        };

        return () => {
            if (typedWindow.__blockNoteImageInsertDataUrlForTest) {
                delete typedWindow.__blockNoteImageInsertDataUrlForTest;
            }
        };
    }, [editor, imageUploadHandler]);

    const { blockUi } = useBlockEditorUi({
        editor,
        noteId: id,
        language,
        mobileKeyboardInset,
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
        if (!editor || editor.isDestroyed) {
            return;
        }

        // editor.view throws when called before the view is mounted (immediatelyRender: false)
        try {
            editor.view.dom.setAttribute('lang', language);
            editor.view.dom.setAttribute(
                'spellcheck',
                editorSpellcheckEnabled ? 'true' : 'false',
            );
        } catch {
            // view not yet mounted; attributes are already set via editorProps.attributes
        }
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
        <div className="flex h-full w-full min-h-0 overflow-hidden">
            <div ref={scrollContainerRef} className="flex-1 min-w-0 overflow-y-auto" style={mobileScrollInsetStyle}>
                <EditorContext.Provider value={{ editor }}>
                    {!readOnly ? blockUi : null}
                    {showRelatedPanel ? (
                        <div className="w-full md:mx-auto md:mt-4 md:max-w-3xl md:px-8">
                            <Deferred
                                data={DEFERRED_RELATED_DATA}
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
                                <MeetingEventMeta
                                    event={meetingEvent}
                                    language={language}
                                    participantsValue={documentProperties.participants ?? ''}
                                    participantOptions={meetingParticipantOptions}
                                    onParticipantsChange={(nextValue) => {
                                        setDocumentProperties((current) => ({
                                            ...current,
                                            participants: nextValue,
                                        }));
                                        requestAnimationFrame(() => {
                                            saveEditor(false);
                                        });
                                    }}
                                    onPersistParticipant={persistMeetingParticipantSuggestion}
                                />
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
        </div>
    );
}

export const SimpleEditorBlock = memo(SimpleEditorComponent);
