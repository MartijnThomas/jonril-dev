<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('calendar_synced_ranges', function (Blueprint $table) {
            $table->id();
            $table->foreignUuid('calendar_id')->constrained()->cascadeOnDelete();
            $table->string('period', 7); // YYYY-MM
            $table->timestamp('synced_at');

            $table->unique(['calendar_id', 'period']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('calendar_synced_ranges');
    }
};
