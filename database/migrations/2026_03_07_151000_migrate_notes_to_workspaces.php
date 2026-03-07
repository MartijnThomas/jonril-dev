<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notes', function (Blueprint $table): void {
            $table->uuid('workspace_id')->nullable()->after('id');
        });

        $now = now();

        $users = DB::table('users')->select('id', 'name', 'settings')->get();
        foreach ($users as $user) {
            $workspaceId = DB::table('workspace_user')
                ->where('user_id', $user->id)
                ->orderByRaw("case when role = 'owner' then 0 else 1 end")
                ->value('workspace_id');

            if (! $workspaceId) {
                $workspaceId = (string) Str::uuid();

                DB::table('workspaces')->insert([
                    'id' => $workspaceId,
                    'owner_id' => $user->id,
                    'name' => trim(($user->name ?? 'Personal').' Workspace'),
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);

                DB::table('workspace_user')->insert([
                    'workspace_id' => $workspaceId,
                    'user_id' => $user->id,
                    'role' => 'owner',
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }

            DB::table('notes')
                ->where('user_id', $user->id)
                ->update(['workspace_id' => $workspaceId]);

            $settings = json_decode((string) ($user->settings ?? '{}'), true);
            if (! is_array($settings)) {
                $settings = [];
            }
            $settings['workspace_id'] = $workspaceId;

            DB::table('users')
                ->where('id', $user->id)
                ->update(['settings' => json_encode($settings)]);
        }

        Schema::table('notes', function (Blueprint $table): void {
            $table->foreign('workspace_id')->references('id')->on('workspaces')->cascadeOnDelete();
            $table->index(['workspace_id']);

            $table->dropUnique(['user_id', 'slug']);
            $table->dropUnique('notes_user_journal_unique');

            $table->unique(['workspace_id', 'slug']);
            $table->unique(['workspace_id', 'journal_granularity', 'journal_date'], 'notes_workspace_journal_unique');

            $table->dropColumn('user_id');
        });
    }

    public function down(): void
    {
        Schema::table('notes', function (Blueprint $table): void {
            $table->unsignedBigInteger('user_id')->nullable()->after('properties');
            $table->index(['user_id']);
        });

        DB::table('notes')
            ->join('workspaces', 'workspaces.id', '=', 'notes.workspace_id')
            ->update(['notes.user_id' => DB::raw('workspaces.owner_id')]);

        Schema::table('notes', function (Blueprint $table): void {
            $table->dropUnique(['workspace_id', 'slug']);
            $table->dropUnique('notes_workspace_journal_unique');

            $table->unique(['user_id', 'slug']);
            $table->unique(['user_id', 'journal_granularity', 'journal_date'], 'notes_user_journal_unique');

            $table->dropForeign(['workspace_id']);
            $table->dropIndex(['workspace_id']);
            $table->dropColumn('workspace_id');
        });
    }
};
