<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Backfill word_count and task_counts into the meta JSON column.
        DB::table('notes')->orderBy('id')->each(function (object $row): void {
            $meta = is_string($row->meta) ? json_decode($row->meta, true) : [];
            if (! is_array($meta)) {
                $meta = [];
            }

            $changed = false;

            if (! isset($meta['word_count']) && $row->word_count !== null) {
                $meta['word_count'] = (int) $row->word_count;
                $changed = true;
            }

            if (! isset($meta['task_counts']) && $row->task_counts !== null) {
                $decoded = is_string($row->task_counts) ? json_decode($row->task_counts, true) : $row->task_counts;
                if ($decoded !== null) {
                    $meta['task_counts'] = $decoded;
                    $changed = true;
                }
            }

            if ($changed) {
                DB::table('notes')->where('id', $row->id)->update(['meta' => json_encode($meta)]);
            }
        });

        Schema::table('notes', function (Blueprint $table): void {
            $table->dropColumn(['word_count', 'task_counts']);
        });
    }

    public function down(): void
    {
        Schema::table('notes', function (Blueprint $table): void {
            $table->unsignedInteger('word_count')->nullable()->after('workspace_id');
            $table->json('task_counts')->nullable()->after('word_count');
        });

        // Restore data from meta back to dedicated columns.
        DB::table('notes')->orderBy('id')->each(function (object $row): void {
            $meta = is_string($row->meta) ? json_decode($row->meta, true) : [];
            if (! is_array($meta)) {
                return;
            }

            $update = [];

            if (isset($meta['word_count'])) {
                $update['word_count'] = (int) $meta['word_count'];
            }

            if (isset($meta['task_counts'])) {
                $update['task_counts'] = json_encode($meta['task_counts']);
            }

            if ($update !== []) {
                DB::table('notes')->where('id', $row->id)->update($update);
            }
        });
    }
};
