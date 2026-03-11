<?php

namespace App\Http\Requests\Settings;

use App\Concerns\ProfileValidationRules;
use App\Models\User;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ProfileUpdateRequest extends FormRequest
{
    use ProfileValidationRules;

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            ...$this->profileRules($this->user()->id),
            'language' => ['sometimes', 'string', Rule::in(['nl', 'en'])],
            'date_long_format' => ['sometimes', 'string', Rule::in(User::LONG_DATE_FORMAT_OPTIONS)],
            'date_short_format' => ['sometimes', 'string', Rule::in(User::SHORT_DATE_FORMAT_OPTIONS)],
            'time_format' => ['sometimes', 'string', Rule::in(User::TIME_FORMAT_OPTIONS)],
        ];
    }
}
