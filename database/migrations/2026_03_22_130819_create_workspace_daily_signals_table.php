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
        Schema::create('workspace_daily_signals', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('workspace_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->string('signal_key', 64);
            $table->string('state', 64);
            $table->json('value_json')->nullable();
            $table->timestamps();

            $table->unique(['workspace_id', 'date', 'signal_key'], 'workspace_daily_signal_unique');
            $table->index(['workspace_id', 'date'], 'workspace_daily_signal_workspace_date_index');
            $table->index(['signal_key', 'state'], 'workspace_daily_signal_key_state_index');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('workspace_daily_signals');
    }
};
