<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('workspaces', 'editor_mode')) {
            return;
        }

        DB::table('workspaces')
            ->where('editor_mode', 'block_tree')
            ->update(['editor_mode' => 'block']);
    }

    public function down(): void
    {
        if (! Schema::hasColumn('workspaces', 'editor_mode')) {
            return;
        }

        DB::table('workspaces')
            ->where('editor_mode', 'block')
            ->update(['editor_mode' => 'block_tree']);
    }
};
