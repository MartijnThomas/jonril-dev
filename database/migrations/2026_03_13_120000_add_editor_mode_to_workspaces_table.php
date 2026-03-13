<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('workspaces', function (Blueprint $table): void {
            $table->string('editor_mode')->default('legacy')->after('timeblock_color');
        });
    }

    public function down(): void
    {
        Schema::table('workspaces', function (Blueprint $table): void {
            $table->dropColumn('editor_mode');
        });
    }
};
