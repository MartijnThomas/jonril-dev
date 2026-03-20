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
        Schema::create('note_images', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('workspace_id');
            $table->uuid('note_id')->nullable();
            $table->unsignedBigInteger('uploaded_by');
            $table->string('disk');
            $table->string('path');
            $table->string('filename');
            $table->string('mime_type');
            $table->unsignedBigInteger('size_bytes');
            $table->unsignedInteger('width')->nullable();
            $table->unsignedInteger('height')->nullable();
            $table->string('sha256', 64)->nullable();
            $table->string('status')->default('active');
            $table->timestamps();

            $table->index(['workspace_id', 'status']);
            $table->index(['note_id', 'status']);
            $table->index(['uploaded_by', 'status']);
            $table->index('sha256');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('note_images');
    }
};
