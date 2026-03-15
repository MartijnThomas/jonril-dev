export type LegacyWikiLinkNote = {
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

export type CreateLegacyEditorExtensionsOptions = {
    wikiLinkNotes?: LegacyWikiLinkNote[];
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
};
