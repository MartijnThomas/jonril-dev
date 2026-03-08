<?php

namespace App\Actions\Fortify;

use App\Concerns\PasswordValidationRules;
use App\Concerns\ProfileValidationRules;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Laravel\Fortify\Contracts\CreatesNewUsers;

class CreateNewUser implements CreatesNewUsers
{
    use PasswordValidationRules, ProfileValidationRules;

    private const ALLOWED_REGISTRATION_EMAILS = [
        'martijn@mthomas.nl',
        'martijn@backyardboats.co',
        'martijn@globe-view.com',
        'aida.biglari.1986@gmail.com',
    ];

    /**
     * Validate and create a newly registered user.
     *
     * @param  array<string, string>  $input
     */
    public function create(array $input): User
    {
        Validator::make($input, [
            ...$this->profileRules(),
            'password' => $this->passwordRules(),
        ])->validate();

        $email = Str::lower(trim((string) ($input['email'] ?? '')));
        if (! in_array($email, self::ALLOWED_REGISTRATION_EMAILS, true)) {
            throw new AuthorizationException('Unauthorised');
        }

        return User::create([
            'name' => $input['name'],
            'email' => $input['email'],
            'password' => $input['password'],
        ]);
    }
}
