<?php

namespace App\Http\Controllers;

use App\Support\Workspaces\WorkspaceSuggestionStore;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class WorkspaceSuggestionController extends Controller
{
    public function __invoke(
        Request $request,
        WorkspaceSuggestionStore $store,
    ): JsonResponse {
        $workspace = $request->user()?->currentWorkspace();
        if (! $workspace) {
            abort(403, 'No workspace available.');
        }

        $data = $request->validate([
            'kind' => ['required', 'string'],
            'value' => ['required', 'string', 'max:64'],
        ]);

        $list = $store->add(
            $workspace,
            (string) $data['kind'],
            (string) $data['value'],
        );

        return response()->json([
            'kind' => strtolower((string) $data['kind']),
            'items' => $list,
        ]);
    }
}
