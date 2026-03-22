export type NoteOptionItem = {
    id: string;
    title: string;
    path?: string | null;
    editablePath?: string;
    workspaceName?: string | null;
    isCrossWorkspace?: boolean;
    href?: string;
    headings?: { id: string; title: string; level: number | null }[];
    parent_id?: string | null;
    is_journal?: boolean;
};

export type NoteOptionsScope =
    | 'wikilink'
    | 'move_parent'
    | 'workspace_linkable'
    | 'meeting_parent';

type LoadNoteOptionsParams = {
    workspaceSlug: string;
    scope: NoteOptionsScope;
    noteId?: string | null;
    search?: string;
    crossWorkspace?: boolean;
    includeHeadings?: boolean;
    limit?: number;
};

const cache = new Map<string, NoteOptionItem[]>();

function cacheKey(params: LoadNoteOptionsParams): string {
    return JSON.stringify({
        workspaceSlug: params.workspaceSlug,
        scope: params.scope,
        noteId: params.noteId ?? null,
        search: (params.search ?? '').trim(),
        crossWorkspace: params.crossWorkspace ?? false,
        includeHeadings: params.includeHeadings ?? false,
        limit: params.limit ?? 0,
    });
}

export async function loadNoteOptions(
    params: LoadNoteOptionsParams,
): Promise<NoteOptionItem[]> {
    const workspaceSlug = params.workspaceSlug.trim();
    if (workspaceSlug === '') {
        return [];
    }

    const key = cacheKey({ ...params, workspaceSlug });
    const cached = cache.get(key);
    if (cached) {
        return cached;
    }

    const query = new URLSearchParams();
    query.set('for', params.scope);
    if (params.noteId) {
        query.set('note_id', params.noteId);
    }
    if ((params.search ?? '').trim() !== '') {
        query.set('q', (params.search ?? '').trim());
    }
    if (params.crossWorkspace) {
        query.set('cross_workspace', '1');
    }
    if (params.includeHeadings) {
        query.set('include_headings', '1');
    }
    if (typeof params.limit === 'number' && Number.isFinite(params.limit)) {
        query.set('limit', String(Math.max(1, Math.floor(params.limit))));
    }

    const response = await fetch(
        `/w/${workspaceSlug}/notes/options?${query.toString()}`,
        {
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
        },
    );

    if (!response.ok) {
        return [];
    }

    const payload = (await response.json()) as {
        options?: NoteOptionItem[];
    };
    const options = Array.isArray(payload.options) ? payload.options : [];
    cache.set(key, options);

    return options;
}

export function clearNoteOptionsCache(): void {
    cache.clear();
}
