<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('note_tasks', function (Blueprint $table): void {
            $table->string('block_id')->nullable()->after('note_id');
            $table->index(['note_id', 'block_id']);
        });
    }

    public function down(): void
    {
        Schema::table('note_tasks', function (Blueprint $table): void {
            $table->dropIndex(['note_id', 'block_id']);
            $table->dropColumn('block_id');
        });
    }
};
