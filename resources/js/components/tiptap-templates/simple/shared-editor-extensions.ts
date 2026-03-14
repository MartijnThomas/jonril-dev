import { Highlight } from '@tiptap/extension-highlight';
import { Image } from '@tiptap/extension-image';
import Mention from '@tiptap/extension-mention';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { TextAlign } from '@tiptap/extension-text-align';
import { Typography } from '@tiptap/extension-typography';
import UniqueID from '@tiptap/extension-unique-id';
import { CharacterCount, Selection } from '@tiptap/extensions';
import type { Extensions } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { HeadingAnchorIdExtension } from '@/components/tiptap-extension/heading-anchor-id-extension';
import {
    NoteTitleIconExtension,
} from '@/components/tiptap-extension/note-title-icon-extension';
import { TaskMigrationMetaExtension } from '@/components/tiptap-extension/task-migration-meta-extension';
import { TimeblockExtension } from '@/components/tiptap-extension/timeblock-extension';
import { WikiLinkMark } from '@/components/tiptap-extension/wiki-link-mark-extension';
import { WikiLinkSuggestion } from '@/components/tiptap-extension/wiki-link-suggestion-extension';
import { InlineCommands } from '@/components/tiptap-inline-commands/InlineCommands';
import { createWorkspaceTokenSuggestion } from '@/components/tiptap-mention/workspace-token-suggestion';
import { HorizontalRule } from '@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node-extension';
import { ImageUploadNode } from '@/components/tiptap-node/image-upload-node/image-upload-node-extension';
import type { CreateSimpleEditorExtensionsOptions } from '@/components/tiptap-templates/simple/simple-editor-extension-options';
import { handleImageUpload, MAX_FILE_SIZE } from '@/lib/tiptap-utils';

type WorkspaceTokenKind = 'mention' | 'hashtag';

function getCookie(name: string): string | null {
    const match = document.cookie
        .split('; ')
        .find((part) => part.startsWith(`${name}=`));

    if (!match) {
        return null;
    }

    return decodeURIComponent(match.split('=').slice(1).join('='));
}

const TextAlignExtension = TextAlign.extend({
    addKeyboardShortcuts() {
        const parentShortcuts = this.parent?.() ?? {};
        const {
            'Mod-Shift-l': removedLeftShortcut,
            'Mod-Shift-e': removedCenterShortcut,
            'Mod-Shift-r': removedRightShortcut,
            'Mod-Shift-j': removedJustifyShortcut,
            ...shortcuts
        } = parentShortcuts;

        void removedLeftShortcut;
        void removedCenterShortcut;
        void removedRightShortcut;
        void removedJustifyShortcut;

        return shortcuts;
    },
});

export function createSharedEditorExtensions({
    wikiLinkNotes = [],
    workspaceSuggestions = { mentions: [], hashtags: [] },
    language = 'nl',
    noteIcon = null,
    noteIconColor = null,
    noteIconBg = null,
    noteType = null,
    journalGranularity = null,
    journalDate = null,
    defaultTimeblockDurationMinutes = 60,
}: CreateSimpleEditorExtensionsOptions = {}): Extensions {
    const mentionItemsRef = { current: [...workspaceSuggestions.mentions] };
    const hashtagItemsRef = { current: [...workspaceSuggestions.hashtags] };

    const persistWorkspaceToken = async (
        kind: WorkspaceTokenKind,
        value: string,
    ): Promise<string[]> => {
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
                kind,
                value,
            }),
        });

        if (!response.ok) {
            return kind === 'mention'
                ? mentionItemsRef.current
                : hashtagItemsRef.current;
        }

        const payload = (await response.json()) as { items?: string[] };
        const items = Array.isArray(payload.items) ? payload.items : [];

        if (kind === 'mention') {
            mentionItemsRef.current = items;
        } else {
            hashtagItemsRef.current = items;
        }

        return items;
    };

    const MentionExtension = Mention.configure({
        HTMLAttributes: {
            class: 'mention',
        },
        suggestion: {
            char: '@',
            ...createWorkspaceTokenSuggestion({
                char: '@',
                heading: 'Mentions',
                itemsRef: mentionItemsRef,
                persistItem: async (value) =>
                    persistWorkspaceToken('mention', value),
            }),
        },
    });

    const HashtagExtension = Mention.extend({
        name: 'hashtag',
    }).configure({
        HTMLAttributes: {
            class: 'hashtag',
        },
        suggestion: {
            char: '#',
            ...createWorkspaceTokenSuggestion({
                char: '#',
                heading: 'Hashtags',
                itemsRef: hashtagItemsRef,
                persistItem: async (value) =>
                    persistWorkspaceToken('hashtag', value),
            }),
        },
    });

    return [
        UniqueID.configure({
            types: [
                'heading',
                'paragraph',
                'taskList',
                'taskItem',
                'checkList',
                'checkItem',
                'bulletList',
                'orderedList',
                'listItem',
            ],
        }),
        HeadingAnchorIdExtension,
        NoteTitleIconExtension.configure({
            iconName:
                typeof noteIcon === 'string' && noteIcon.trim() !== ''
                    ? noteIcon.trim()
                    : null,
            iconColor:
                typeof noteIconColor === 'string' &&
                noteIconColor.trim() !== ''
                    ? noteIconColor.trim()
                    : null,
            iconBg:
                typeof noteIconBg === 'string' && noteIconBg.trim() !== ''
                    ? noteIconBg.trim()
                    : null,
        }),
        StarterKit.configure({
            horizontalRule: false,
            listItem: false,
            bulletList: false,
            orderedList: false,
            link: {
                openOnClick: false,
                enableClickSelection: true,
            },
        }),
        WikiLinkMark,
        HorizontalRule,
        TextAlignExtension.configure({ types: ['heading', 'paragraph'] }),
        Highlight.configure({ multicolor: true }),
        Image,
        Typography.configure({
            laquo: false,
            raquo: false,
        }),
        Superscript,
        Subscript,
        Selection,
        InlineCommands,
        TimeblockExtension.configure({
            enabled:
                noteType === 'journal' &&
                journalGranularity === 'daily' &&
                typeof journalDate === 'string' &&
                journalDate.trim() !== '',
            journalDate,
            defaultDurationMinutes: defaultTimeblockDurationMinutes,
        }),
        TaskMigrationMetaExtension.configure({
            notes: wikiLinkNotes,
        }),
        WikiLinkSuggestion.configure({
            notes: wikiLinkNotes,
        }),
        CharacterCount.configure({
            mode: 'textSize',
        }),
        MentionExtension,
        HashtagExtension,
        ImageUploadNode.configure({
            accept: 'image/*',
            maxSize: MAX_FILE_SIZE,
            limit: 3,
            upload: handleImageUpload,
            onError: (error) => console.error('Upload failed:', error),
        }),
    ];
}
