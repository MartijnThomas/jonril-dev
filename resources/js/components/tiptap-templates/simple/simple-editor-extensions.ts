import { Highlight } from '@tiptap/extension-highlight';
import { Image } from '@tiptap/extension-image';
import { TaskList } from '@tiptap/extension-list';
import Mention from '@tiptap/extension-mention';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { TextAlign } from '@tiptap/extension-text-align';
import { Typography } from '@tiptap/extension-typography';
import UniqueID from '@tiptap/extension-unique-id';
import { CharacterCount, Selection } from '@tiptap/extensions';
import { StarterKit } from '@tiptap/starter-kit';

import { HeadingAnchorIdExtension } from '@/components/tiptap-extension/heading-anchor-id-extension';
import { ListItemPriorityExtension } from '@/components/tiptap-extension/list-item-priority-extension';
import { ListItemWithPriority } from '@/components/tiptap-extension/list-item-with-priority-extension';
import {
    NoteTitleIconExtension,
} from '@/components/tiptap-extension/note-title-icon-extension';
import { TaskItemWithDates } from '@/components/tiptap-extension/task-item-dates-extension';
import { TaskItemStatusExtension } from '@/components/tiptap-extension/task-item-status-extension';
import { TaskMigrationMetaExtension } from '@/components/tiptap-extension/task-migration-meta-extension';
import { WikiLinkMark } from '@/components/tiptap-extension/wiki-link-mark-extension';
import { WikiLinkSuggestion } from '@/components/tiptap-extension/wiki-link-suggestion-extension';
import { InlineCommands } from '@/components/tiptap-inline-commands/InlineCommands';
import { createWorkspaceTokenSuggestion } from '@/components/tiptap-mention/workspace-token-suggestion';
import { HorizontalRule } from '@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node-extension';
import { ImageUploadNode } from '@/components/tiptap-node/image-upload-node/image-upload-node-extension';
import { handleImageUpload, MAX_FILE_SIZE } from '@/lib/tiptap-utils';

type WikiLinkNote = {
    id: string;
    title: string;
    path?: string;
    href?: string;
};

type CreateSimpleEditorExtensionsOptions = {
    wikiLinkNotes?: WikiLinkNote[];
    workspaceSuggestions?: {
        mentions: string[];
        hashtags: string[];
    };
    language?: string;
    noteIcon?: string | null;
    noteIconColor?: string | null;
    noteIconBg?: string | null;
};

export function createSimpleEditorExtensions({
    wikiLinkNotes = [],
    workspaceSuggestions = { mentions: [], hashtags: [] },
    language = 'nl',
    noteIcon = null,
    noteIconColor = null,
    noteIconBg = null,
}: CreateSimpleEditorExtensionsOptions = {}) {
    const displayLocale = language === 'en' ? 'en-US' : 'nl-NL';
    const mentionItemsRef = { current: [...workspaceSuggestions.mentions] };
    const hashtagItemsRef = { current: [...workspaceSuggestions.hashtags] };

    const getCookie = (name: string): string | null => {
        const match = document.cookie
            .split('; ')
            .find((part) => part.startsWith(`${name}=`));

        if (!match) {
            return null;
        }

        return decodeURIComponent(match.split('=').slice(1).join('='));
    };

    const persistWorkspaceToken = async (
        kind: 'mention' | 'hashtag',
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

    const TextAlignExtension = TextAlign.extend({
        addKeyboardShortcuts() {
            const parentShortcuts = this.parent?.() ?? {};
            const {
                'Mod-Shift-l': removedLeftShortcut,
                'Mod-Shift-e': removedShortcut,
                'Mod-Shift-r': removedRightShortcut,
                'Mod-Shift-j': removedJustifyShortcut,
                ...shortcuts
            } = parentShortcuts;

            void removedLeftShortcut;
            void removedShortcut;
            void removedRightShortcut;
            void removedJustifyShortcut;

            return shortcuts;
        },
    });

    return [
        UniqueID.configure({
            types: [
                'heading',
                'paragraph',
                'taskList',
                'taskItem',
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
            link: {
                openOnClick: false,
                enableClickSelection: true,
            },
        }),
        ListItemWithPriority.configure({}),
        WikiLinkMark,
        HorizontalRule,
        TextAlignExtension.configure({ types: ['heading', 'paragraph'] }),
        TaskList,
        TaskItemWithDates.configure({ nested: true, displayLocale }),
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
        ListItemPriorityExtension,
        TaskItemStatusExtension,
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
