<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('workspaces', function (Blueprint $table): void {
            $table->json('mention_suggestions')->nullable()->after('name');
            $table->json('hashtag_suggestions')->nullable()->after('mention_suggestions');
        });
    }

    public function down(): void
    {
        Schema::table('workspaces', function (Blueprint $table): void {
            $table->dropColumn(['mention_suggestions', 'hashtag_suggestions']);
        });
    }
};
