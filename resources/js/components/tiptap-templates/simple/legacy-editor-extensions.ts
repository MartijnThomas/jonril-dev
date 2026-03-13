import { createLegacyListBehaviorExtensions } from '@/components/tiptap-templates/simple/legacy-list-behavior-extensions';
import type { CreateSimpleEditorExtensionsOptions } from '@/components/tiptap-templates/simple/simple-editor-extension-options';
import { createSharedEditorExtensions } from '@/components/tiptap-templates/simple/shared-editor-extensions';

export type { CreateSimpleEditorExtensionsOptions };

export function createLegacyEditorExtensions({
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
    editorMode: _editorMode = 'legacy',
}: CreateSimpleEditorExtensionsOptions = {}) {
    const displayLocale = language === 'en' ? 'en-US' : 'nl-NL';

    return [
        ...createSharedEditorExtensions({
            wikiLinkNotes,
            workspaceSuggestions,
            language,
            noteIcon,
            noteIconColor,
            noteIconBg,
            noteType,
            journalGranularity,
            journalDate,
            defaultTimeblockDurationMinutes,
        }),
        ...createLegacyListBehaviorExtensions(displayLocale),
    ];
}
