<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('calendar_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('calendar_id')->constrained()->cascadeOnDelete();
            $table->string('uid')->index();
            $table->string('etag')->nullable();
            $table->string('href')->nullable();
            $table->string('location')->nullable();
            $table->text('description')->nullable();
            $table->string('rrule')->nullable();
            $table->text('raw_ical')->nullable();
            $table->timestamps();

            $table->unique(['calendar_id', 'uid']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('calendar_items');
    }
};
