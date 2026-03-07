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
        Schema::table('notes', function (Blueprint $table) {
            $table->string('slug')->nullable()->after('type');
            $table->string('journal_granularity')->nullable()->after('slug');
            $table->date('journal_date')->nullable()->after('journal_granularity');

            $table->unique(['user_id', 'slug']);
            $table->unique(['user_id', 'journal_granularity', 'journal_date'], 'notes_user_journal_unique');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('notes', function (Blueprint $table) {
            $table->dropUnique(['user_id', 'slug']);
            $table->dropUnique('notes_user_journal_unique');

            $table->dropColumn(['slug', 'journal_granularity', 'journal_date']);
        });
    }
};
