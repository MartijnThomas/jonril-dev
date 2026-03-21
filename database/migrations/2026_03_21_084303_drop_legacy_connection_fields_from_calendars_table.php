<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('calendars', function (Blueprint $table) {
            if (Schema::hasColumn('calendars', 'connection_id')) {
                $table->dropIndex(['workspace_id', 'connection_id']);
                $table->dropColumn('connection_id');
            }

            if (Schema::hasColumn('calendars', 'provider')) {
                $table->dropColumn('provider');
            }

            if (Schema::hasColumn('calendars', 'username')) {
                $table->dropColumn('username');
            }

            if (Schema::hasColumn('calendars', 'password')) {
                $table->dropColumn('password');
            }
        });
    }

    public function down(): void
    {
        Schema::table('calendars', function (Blueprint $table) {
            if (! Schema::hasColumn('calendars', 'connection_id')) {
                $table->uuid('connection_id')->nullable()->after('calendar_connection_id');
                $table->index(['workspace_id', 'connection_id']);
            }

            if (! Schema::hasColumn('calendars', 'provider')) {
                $table->string('provider')->default('caldav')->after('name');
            }

            if (! Schema::hasColumn('calendars', 'username')) {
                $table->string('username')->nullable()->after('url');
            }

            if (! Schema::hasColumn('calendars', 'password')) {
                $table->text('password')->nullable()->after('username');
            }
        });
    }
};
