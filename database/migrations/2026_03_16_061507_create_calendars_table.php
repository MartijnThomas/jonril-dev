<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('calendars', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('workspace_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('provider')->default('caldav');
            $table->text('url');
            $table->string('username');
            $table->text('password');
            $table->string('color')->nullable();
            $table->string('sync_token')->nullable();
            $table->timestamp('last_synced_at')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index('workspace_id');
        });

        Schema::table('events', function (Blueprint $table) {
            $table->boolean('all_day')->default(false)->after('ends_at');
        });
    }

    public function down(): void
    {
        Schema::table('events', function (Blueprint $table) {
            $table->dropColumn('all_day');
        });

        Schema::dropIfExists('calendars');
    }
};
