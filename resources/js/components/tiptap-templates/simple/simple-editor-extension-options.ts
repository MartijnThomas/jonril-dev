export type WikiLinkNote = {
    id: string;
    title: string;
    path?: string;
    href?: string;
};

export type BlockTaskStatusMenuPayload = {
    x: number;
    y: number;
    pos: number;
    status: 'backlog' | 'in_progress' | 'canceled' | null;
};

export type CreateSimpleEditorExtensionsOptions = {
    wikiLinkNotes?: WikiLinkNote[];
    workspaceSuggestions?: {
        mentions: string[];
        hashtags: string[];
    };
    language?: string;
    noteIcon?: string | null;
    noteIconColor?: string | null;
    noteIconBg?: string | null;
    noteType?: string | null;
    journalGranularity?: string | null;
    journalDate?: string | null;
    defaultTimeblockDurationMinutes?: number;
    editorMode?: 'legacy' | 'block';
    onBlockTaskStatusMenuRequest?: (payload: BlockTaskStatusMenuPayload) => void;
};
