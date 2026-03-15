import type { CreateLegacyEditorExtensionsOptions } from '@/components/tiptap-templates/simple/legacy-editor-extension-options';
import { createLegacyListBehaviorExtensions } from '@/components/tiptap-templates/simple/legacy-list-behavior-extensions';
import { createLegacySharedEditorExtensions } from '@/components/tiptap-templates/simple/legacy-shared-editor-extensions';

export type { CreateLegacyEditorExtensionsOptions };

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
}: CreateLegacyEditorExtensionsOptions = {}) {
    const displayLocale = language === 'en' ? 'en-US' : 'nl-NL';

    return [
        ...createLegacySharedEditorExtensions({
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
