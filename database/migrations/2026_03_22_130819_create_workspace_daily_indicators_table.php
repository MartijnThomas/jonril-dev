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
        Schema::create('workspace_daily_indicators', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('workspace_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->string('structure_state', 32)->nullable();
            $table->string('calendar_state', 32)->nullable();
            $table->string('work_state', 32)->nullable();
            $table->boolean('has_note')->default(false);
            $table->boolean('has_events')->default(false);
            $table->unsignedInteger('tasks_open_count')->default(0);
            $table->unsignedInteger('tasks_completed_count')->default(0);
            $table->timestamps();

            $table->unique(['workspace_id', 'date'], 'workspace_daily_indicator_unique');
            $table->index(['workspace_id', 'date'], 'workspace_daily_indicator_workspace_date_index');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('workspace_daily_indicators');
    }
};
