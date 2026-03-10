<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('note_tasks', function (Blueprint $table): void {
            $table->date('journal_date')->nullable()->after('deadline_date');
            $table->index('journal_date');
        });

        DB::table('notes')
            ->select('id', 'journal_date')
            ->where('type', 'journal')
            ->where('journal_granularity', 'daily')
            ->whereNotNull('journal_date')
            ->orderBy('id')
            ->chunk(200, function ($notes): void {
                foreach ($notes as $note) {
                    DB::table('note_tasks')
                        ->where('note_id', $note->id)
                        ->update(['journal_date' => $note->journal_date]);
                }
            });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('note_tasks', function (Blueprint $table): void {
            $table->dropIndex(['journal_date']);
            $table->dropColumn('journal_date');
        });
    }
};
