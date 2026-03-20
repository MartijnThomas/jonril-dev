import type { UploadFunction } from '@/components/tiptap-node/image-upload-node/image-upload-node-extension';

type UploadResponse = {
    id?: string;
    src?: string;
};

function getCsrfTokenFromMeta(): string | null {
    if (typeof document === 'undefined') {
        return null;
    }

    const token = document
        .querySelector('meta[name="csrf-token"]')
        ?.getAttribute('content');

    if (typeof token !== 'string') {
        return null;
    }

    const normalized = token.trim();

    return normalized === '' ? null : normalized;
}

function getCookie(name: string): string | null {
    const match = document.cookie
        .split('; ')
        .find((part) => part.startsWith(`${name}=`));

    if (!match) {
        return null;
    }

    return decodeURIComponent(match.split('=').slice(1).join('='));
}

export function createBlockNoteImageUploadHandler(
    uploadUrl: string,
    noteId?: string | null,
): UploadFunction {
    return async (file, onProgress, abortSignal) => {
        const headers: Record<string, string> = {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        };

        const xsrfToken = getCookie('XSRF-TOKEN');
        if (xsrfToken) {
            headers['X-XSRF-TOKEN'] = xsrfToken;
        }

        const csrfToken = getCsrfTokenFromMeta();
        if (csrfToken) {
            headers['X-CSRF-TOKEN'] = csrfToken;
        }

        onProgress?.({ progress: 0 });

        const formData = new FormData();
        formData.append('file', file, file.name);
        if (typeof noteId === 'string' && noteId.trim() !== '') {
            formData.append('note_id', noteId.trim());
        }
        if (csrfToken) {
            formData.append('_token', csrfToken);
        }

        const response = await fetch(uploadUrl, {
            method: 'POST',
            credentials: 'same-origin',
            headers,
            body: formData,
            signal: abortSignal,
        });

        if (!response.ok) {
            const errorPayload = (await response.json().catch(() => null)) as {
                message?: string;
            } | null;
            const errorMessage =
                typeof errorPayload?.message === 'string' &&
                errorPayload.message.trim() !== ''
                    ? errorPayload.message
                    : 'Image upload failed.';
            throw new Error(errorMessage);
        }

        const payload = (await response.json()) as UploadResponse | null;
        const src = payload?.src;

        if (typeof src !== 'string' || src.trim() === '') {
            throw new Error('Image upload response is missing src.');
        }

        onProgress?.({ progress: 100 });

        return src;
    };
}
