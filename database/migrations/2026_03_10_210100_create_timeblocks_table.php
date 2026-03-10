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
        Schema::create('timeblocks', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('location')->nullable();
            $table->uuid('task_block_id')->nullable();
            $table->boolean('task_checked')->nullable();
            $table->string('task_status')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->index('task_block_id');
            $table->index('task_status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('timeblocks');
    }
};
