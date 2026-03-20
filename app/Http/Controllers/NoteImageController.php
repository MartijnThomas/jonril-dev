<?php

namespace App\Http\Controllers;

use App\Models\Note;
use App\Models\NoteImage;
use App\Models\Workspace;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class NoteImageController extends Controller
{
    public function store(Request $request, Workspace $workspace): JsonResponse
    {
        $this->assertWorkspaceMember($request, $workspace);

        $maxUploadMb = max(1, (int) config('note-images.max_upload_mb', 5));
        $maxUploadKilobytes = $maxUploadMb * 1024;

        $data = $request->validate([
            'file' => ['required', 'file', 'image', "max:{$maxUploadKilobytes}"],
            'note_id' => ['nullable', 'uuid', 'exists:notes,id'],
            'alt' => ['nullable', 'string', 'max:255'],
        ]);

        $note = null;
        if (isset($data['note_id'])) {
            $note = Note::query()
                ->where('id', $data['note_id'])
                ->where('workspace_id', $workspace->id)
                ->first();

            if (! $note) {
                return response()->json([
                    'message' => 'The selected note is invalid for this workspace.',
                    'errors' => [
                        'note_id' => ['The selected note is invalid for this workspace.'],
                    ],
                ], 422);
            }
        }

        $file = $data['file'];
        $imageId = (string) Str::uuid();
        $disk = $workspace->resolvedStorageDisk();
        $extension = $file->extension() ?: $file->guessExtension() ?: 'bin';
        $relativePath = trim($workspace->imageStorageDirectory(), '/')
            .'/'.now()->format('Y/m')
            ."/{$imageId}.{$extension}";

        Storage::disk($disk)->putFileAs(
            dirname($relativePath),
            $file,
            basename($relativePath),
        );

        $dimensions = @getimagesize($file->getRealPath() ?: '');

        $image = NoteImage::query()->create([
            'id' => $imageId,
            'workspace_id' => $workspace->id,
            'note_id' => $note?->id,
            'uploaded_by' => (int) $request->user()->id,
            'disk' => $disk,
            'path' => $relativePath,
            'filename' => (string) $file->getClientOriginalName(),
            'mime_type' => (string) $file->getMimeType(),
            'size_bytes' => (int) $file->getSize(),
            'width' => is_array($dimensions) ? (int) ($dimensions[0] ?? 0) : null,
            'height' => is_array($dimensions) ? (int) ($dimensions[1] ?? 0) : null,
            'sha256' => hash_file('sha256', $file->getRealPath() ?: ''),
            'status' => 'active',
        ]);

        return response()->json([
            'id' => $image->id,
            'src' => route('workspace.images.show', ['workspace' => $workspace->slug, 'image' => $image->id], absolute: false),
            'alt' => isset($data['alt']) ? trim((string) $data['alt']) : '',
            'mime_type' => $image->mime_type,
            'size_bytes' => $image->size_bytes,
            'width' => $image->width,
            'height' => $image->height,
        ], 201);
    }

    public function show(Request $request, Workspace $workspace, NoteImage $image)
    {
        $this->assertWorkspaceMember($request, $workspace);
        abort_unless($image->workspace_id === $workspace->id, 404);
        abort_unless($image->status === 'active', 404);
        abort_unless(Storage::disk($image->disk)->exists($image->path), 404);

        return Storage::disk($image->disk)->response(
            $image->path,
            $image->filename,
            [
                'Cache-Control' => 'public, max-age=604800',
            ],
        );
    }

    private function assertWorkspaceMember(Request $request, Workspace $workspace): void
    {
        $isMember = $workspace->users()
            ->where('users.id', $request->user()->id)
            ->exists();

        abort_unless($isMember, 403);
    }
}
