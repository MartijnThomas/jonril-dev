import { Transition } from '@headlessui/react';
import { Form, Head, Link, usePage } from '@inertiajs/react';
import ProfileController from '@/actions/App/Http/Controllers/Settings/ProfileController';
import DeleteUser from '@/components/delete-user';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { useI18n } from '@/lib/i18n';
import { edit } from '@/routes/profile';
import { send } from '@/routes/verification';
import type { BreadcrumbItem } from '@/types';

export default function Profile({
    mustVerifyEmail,
    status,
    language,
    dateLongFormat,
    dateShortFormat,
    timeFormat,
}: {
    mustVerifyEmail: boolean;
    status?: string;
    language: 'nl' | 'en';
    dateLongFormat: string;
    dateShortFormat: string;
    timeFormat: string;
}) {
    const { auth } = usePage().props;
    const { t } = useI18n();
    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: t('settings_profile.page_title', 'Profile settings'),
            href: edit(),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('settings_profile.page_title', 'Profile settings')} />

            <h1 className="sr-only">{t('settings_profile.page_title', 'Profile settings')}</h1>

            <SettingsLayout>
                <div className="space-y-6">
                    <Heading
                        variant="small"
                        title={t('settings_profile.heading', 'Profile information')}
                        description={t(
                            'settings_profile.description',
                            'Update your name and email address',
                        )}
                    />

                    <Form
                        {...ProfileController.update.form()}
                        options={{
                            preserveScroll: true,
                        }}
                        className="space-y-6"
                    >
                        {({ processing, recentlySuccessful, errors }) => (
                            <>
                                <div className="grid gap-2">
                                    <Label htmlFor="name">{t('settings_profile.name', 'Name')}</Label>

                                    <Input
                                        id="name"
                                        className="mt-1 block w-full"
                                        defaultValue={auth.user.name}
                                        name="name"
                                        required
                                        autoComplete="name"
                                        placeholder={t('settings_profile.name_placeholder', 'Full name')}
                                    />

                                    <InputError
                                        className="mt-2"
                                        message={errors.name}
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="email">
                                        {t('settings_profile.email', 'Email address')}
                                    </Label>

                                    <Input
                                        id="email"
                                        type="email"
                                        className="mt-1 block w-full"
                                        defaultValue={auth.user.email}
                                        name="email"
                                        required
                                        autoComplete="username"
                                        placeholder={t(
                                            'settings_profile.email_placeholder',
                                            'Email address',
                                        )}
                                    />

                                    <InputError
                                        className="mt-2"
                                        message={errors.email}
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="language">
                                        {t('settings_profile.language', 'Language')}
                                    </Label>
                                    <select
                                        id="language"
                                        name="language"
                                        defaultValue={language}
                                        className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none"
                                    >
                                        <option value="nl">
                                            {t('settings_profile.language_nl', 'Nederlands')}
                                        </option>
                                        <option value="en">
                                            {t('settings_profile.language_en', 'English')}
                                        </option>
                                    </select>
                                    <InputError
                                        className="mt-2"
                                        message={errors.language}
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="date_long_format">
                                        {t('settings_profile.date_long_format', 'Long date format')}
                                    </Label>
                                    <select
                                        id="date_long_format"
                                        name="date_long_format"
                                        defaultValue={dateLongFormat}
                                        className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none"
                                    >
                                        <option value="weekday_day_month_year">
                                            {t(
                                                'settings_profile.date_long_format_weekday_day_month_year',
                                                'Wednesday 11 March 2026',
                                            )}
                                        </option>
                                        <option value="weekday_month_day_year">
                                            {t(
                                                'settings_profile.date_long_format_weekday_month_day_year',
                                                'Wednesday March 11, 2026',
                                            )}
                                        </option>
                                        <option value="day_month_year">
                                            {t(
                                                'settings_profile.date_long_format_day_month_year',
                                                '11 March 2026',
                                            )}
                                        </option>
                                        <option value="iso_date">
                                            {t(
                                                'settings_profile.date_long_format_iso_date',
                                                '2026-03-11',
                                            )}
                                        </option>
                                    </select>
                                    <InputError
                                        className="mt-2"
                                        message={errors.date_long_format}
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="date_short_format">
                                        {t('settings_profile.date_short_format', 'Short date format')}
                                    </Label>
                                    <select
                                        id="date_short_format"
                                        name="date_short_format"
                                        defaultValue={dateShortFormat}
                                        className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none"
                                    >
                                        <option value="weekday_day_month_short_year">
                                            {t(
                                                'settings_profile.date_short_format_weekday_day_month_short_year',
                                                "Wed 12 Mar '26",
                                            )}
                                        </option>
                                        <option value="day_month_short_year">
                                            {t(
                                                'settings_profile.date_short_format_day_month_short_year',
                                                "12 Mar '26",
                                            )}
                                        </option>
                                        <option value="numeric_day_month_year">
                                            {t(
                                                'settings_profile.date_short_format_numeric_day_month_year',
                                                '12-03-26',
                                            )}
                                        </option>
                                        <option value="iso_date">
                                            {t(
                                                'settings_profile.date_short_format_iso_date',
                                                '2026-03-12',
                                            )}
                                        </option>
                                    </select>
                                    <InputError
                                        className="mt-2"
                                        message={errors.date_short_format}
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="time_format">
                                        {t('settings_profile.time_format', 'Time format')}
                                    </Label>
                                    <select
                                        id="time_format"
                                        name="time_format"
                                        defaultValue={timeFormat}
                                        className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none"
                                    >
                                        <option value="24h">
                                            {t('settings_profile.time_format_24h', '24-hour (14:30)')}
                                        </option>
                                        <option value="12h">
                                            {t('settings_profile.time_format_12h', '12-hour (2:30 PM)')}
                                        </option>
                                    </select>
                                    <InputError
                                        className="mt-2"
                                        message={errors.time_format}
                                    />
                                </div>

                                {mustVerifyEmail &&
                                    auth.user.email_verified_at === null && (
                                        <div>
                                            <p className="-mt-4 text-sm text-muted-foreground">
                                                {t(
                                                    'settings_profile.email_unverified',
                                                    'Your email address is unverified.',
                                                )}{' '}
                                                <Link
                                                    href={send()}
                                                    as="button"
                                                    className="text-foreground underline decoration-neutral-300 underline-offset-4 transition-colors duration-300 ease-out hover:decoration-current! dark:decoration-neutral-500"
                                                >
                                                    {t(
                                                        'settings_profile.resend_verification',
                                                        'Click here to resend the verification email.',
                                                    )}
                                                </Link>
                                            </p>

                                            {status ===
                                                'verification-link-sent' && (
                                                <div className="mt-2 text-sm font-medium text-green-600">
                                                    {t(
                                                        'settings_profile.verification_sent',
                                                        'A new verification link has been sent to your email address.',
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                <div className="flex items-center gap-4">
                                    <Button
                                        disabled={processing}
                                        data-test="update-profile-button"
                                    >
                                        {t('settings_profile.save', 'Save')}
                                    </Button>

                                    <Transition
                                        show={recentlySuccessful}
                                        enter="transition ease-in-out"
                                        enterFrom="opacity-0"
                                        leave="transition ease-in-out"
                                        leaveTo="opacity-0"
                                    >
                                        <p className="text-sm text-neutral-600">
                                            {t('settings_profile.saved', 'Saved')}
                                        </p>
                                    </Transition>
                                </div>
                            </>
                        )}
                    </Form>
                </div>

                <DeleteUser />
            </SettingsLayout>
        </AppLayout>
    );
}
