<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('workspaces', function (Blueprint $table): void {
            $table->boolean('is_personal')->default(false)->after('owner_id');
            $table->index(['owner_id', 'is_personal']);
        });

        $ownerIds = DB::table('workspaces')
            ->select('owner_id')
            ->distinct()
            ->pluck('owner_id');

        $personalWorkspaceIds = $ownerIds
            ->map(function ($ownerId): ?string {
                $workspaceId = DB::table('workspaces')
                    ->where('owner_id', $ownerId)
                    ->orderBy('created_at')
                    ->orderBy('id')
                    ->value('id');

                return is_string($workspaceId) && $workspaceId !== ''
                    ? $workspaceId
                    : null;
            })
            ->filter()
            ->values();

        if ($personalWorkspaceIds->isNotEmpty()) {
            DB::table('workspaces')
                ->whereIn('id', $personalWorkspaceIds->all())
                ->update([
                    'is_personal' => true,
                    'updated_at' => now(),
                ]);
        }
    }

    public function down(): void
    {
        Schema::table('workspaces', function (Blueprint $table): void {
            $table->dropIndex(['owner_id', 'is_personal']);
            $table->dropColumn('is_personal');
        });
    }
};
