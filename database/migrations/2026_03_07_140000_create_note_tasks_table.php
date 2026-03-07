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
        Schema::create('note_tasks', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->uuid('note_id');
            $table->string('note_title')->nullable();
            $table->uuid('parent_note_id')->nullable();
            $table->string('parent_note_title')->nullable();
            $table->unsignedInteger('position')->default(0);
            $table->boolean('checked')->default(false);
            $table->text('content_text')->nullable();
            $table->date('due_date')->nullable();
            $table->date('deadline_date')->nullable();
            $table->json('mentions')->nullable();
            $table->json('hashtags')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'note_id']);
            $table->index(['user_id', 'checked']);
            $table->index(['user_id', 'due_date']);
            $table->index(['user_id', 'deadline_date']);
            $table->index(['user_id', 'parent_note_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('note_tasks');
    }
};
