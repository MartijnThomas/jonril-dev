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
        if (Schema::hasColumn('calendars', 'calendar_connection_id')) {
            return;
        }

        Schema::table('calendars', function (Blueprint $table): void {
            $table->uuid('connection_id')->nullable()->after('workspace_id');
            $table->index(['workspace_id', 'connection_id']);
        });

        DB::table('calendars')
            ->select('id')
            ->orderBy('id')
            ->chunkById(200, function ($rows): void {
                foreach ($rows as $row) {
                    DB::table('calendars')
                        ->where('id', $row->id)
                        ->update(['connection_id' => (string) Str::uuid()]);
                }
            }, 'id');
    }

    public function down(): void
    {
        if (! Schema::hasColumn('calendars', 'connection_id')) {
            return;
        }

        Schema::table('calendars', function (Blueprint $table): void {
            $table->dropIndex(['workspace_id', 'connection_id']);
            $table->dropColumn('connection_id');
        });
    }
};
