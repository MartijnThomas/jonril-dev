<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('workspace_daily_indicators', function (Blueprint $table): void {
            $table->unsignedInteger('events_count')->default(0)->after('has_events');
            $table->unsignedInteger('birthday_count')->default(0)->after('events_count');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('workspace_daily_indicators', function (Blueprint $table): void {
            $table->dropColumn(['events_count', 'birthday_count']);
        });
    }
};
