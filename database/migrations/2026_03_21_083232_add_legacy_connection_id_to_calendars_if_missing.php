<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('calendars') || Schema::hasColumn('calendars', 'connection_id')) {
            return;
        }

        Schema::table('calendars', function (Blueprint $table) {
            $table->uuid('connection_id')->nullable()->after('workspace_id');
            $table->index(['workspace_id', 'connection_id']);
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('calendars') || ! Schema::hasColumn('calendars', 'connection_id')) {
            return;
        }

        Schema::table('calendars', function (Blueprint $table) {
            try {
                $table->dropIndex(['workspace_id', 'connection_id']);
            } catch (\Throwable) {
            }

            $table->dropColumn('connection_id');
        });
    }
};
