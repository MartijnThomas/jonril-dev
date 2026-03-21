import type { UploadFunction } from '@/components/tiptap-node/image-upload-node/image-upload-node-extension';

export type BlockWikiLinkNote = {
    id: string;
    title: string;
    path?: string;
    href?: string;
    headings?: {
        id: string;
        title: string;
        level: number | null;
    }[];
};

export type CreateBlockTreeEditorExtensionsOptions = {
    wikiLinkNotes?: BlockWikiLinkNote[];
    workspaceSuggestions?: {
        mentions: string[];
        hashtags: string[];
    };
    language?: string;
    noteType?: string | null;
    journalGranularity?: string | null;
    journalDate?: string | null;
    timeblockSyncByBlockId?: Record<string, 'pending' | 'failed'>;
    defaultTimeblockDurationMinutes?: number;
    imageUploadHandler?: UploadFunction;
};
