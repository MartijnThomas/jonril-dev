<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class TriggerAdminMaintenanceCommandRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (string) ($this->user()?->role ?? '') === 'admin';
    }

    public function rules(): array
    {
        return [
            'action' => [
                'required',
                'string',
                Rule::in([
                    'reindex_tasks',
                    'reindex_scout',
                    'daily_signals_reconcile',
                    'prune_note_images',
                    'backup_hourly_db',
                    'backup_full',
                ]),
            ],
        ];
    }
}
