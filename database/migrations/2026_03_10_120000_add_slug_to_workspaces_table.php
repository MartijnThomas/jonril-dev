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
        Schema::table('workspaces', function (Blueprint $table): void {
            $table->string('slug')->nullable()->after('name');
        });

        $workspaces = DB::table('workspaces')
            ->select('id', 'name')
            ->orderBy('created_at')
            ->orderBy('id')
            ->get();

        $used = [];
        foreach ($workspaces as $workspace) {
            $base = Str::slug((string) ($workspace->name ?? ''));
            if ($base === '') {
                $base = 'workspace';
            }

            $candidate = $base;
            $suffix = 2;
            while (in_array($candidate, $used, true)) {
                $candidate = "{$base}-{$suffix}";
                $suffix++;
            }

            $used[] = $candidate;

            DB::table('workspaces')
                ->where('id', $workspace->id)
                ->update(['slug' => $candidate]);
        }

        Schema::table('workspaces', function (Blueprint $table): void {
            $table->unique('slug');
        });
    }

    public function down(): void
    {
        Schema::table('workspaces', function (Blueprint $table): void {
            $table->dropUnique(['slug']);
            $table->dropColumn('slug');
        });
    }
};

