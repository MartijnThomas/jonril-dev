import { Highlight } from '@tiptap/extension-highlight';
import { Image } from '@tiptap/extension-image';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import Mention from '@tiptap/extension-mention';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { TextAlign } from '@tiptap/extension-text-align';
import { Typography } from '@tiptap/extension-typography';
import UniqueID from '@tiptap/extension-unique-id';
import { Selection } from '@tiptap/extensions';
import { StarterKit } from '@tiptap/starter-kit';

import { InlineCommands } from '@/components/tiptap-inline-commands/InlineCommands';
import hashtagSuggestion from '@/components/tiptap-mention/HashtagSuggestion';
import mentionSuggestion from '@/components/tiptap-mention/MentionSuggestion';
import { HorizontalRule } from '@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node-extension';
import { ImageUploadNode } from '@/components/tiptap-node/image-upload-node/image-upload-node-extension';
import { handleImageUpload, MAX_FILE_SIZE } from '@/lib/tiptap-utils';

export function createSimpleEditorExtensions() {
    const MentionExtension = Mention.configure({
        HTMLAttributes: {
            class: 'mention',
        },
        suggestion: {
            char: '@',
            ...mentionSuggestion,
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
            ...hashtagSuggestion,
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
        StarterKit.configure({
            horizontalRule: false,
            link: {
                openOnClick: false,
                enableClickSelection: true,
            },
        }),
        HorizontalRule,
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Highlight.configure({ multicolor: true }),
        Image,
        Typography,
        Superscript,
        Subscript,
        Selection,
        InlineCommands,
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
