import { Head, useForm } from '@inertiajs/react';
import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { edit as editEditorPreferences } from '@/routes/editor-preferences';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Editor preferences',
        href: editEditorPreferences(),
    },
];

type Props = {
    preferences: {
        sidebar_left_open_default: boolean;
        sidebar_right_open_default: boolean;
    };
};

export default function EditorPreferences({ preferences }: Props) {
    const form = useForm({
        sidebar_left_open_default: preferences.sidebar_left_open_default,
        sidebar_right_open_default: preferences.sidebar_right_open_default,
    });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Editor preferences" />

            <h1 className="sr-only">Editor preferences</h1>

            <SettingsLayout>
                <div className="space-y-6">
                    <Heading
                        variant="small"
                        title="Editor preferences"
                        description="Set default sidebar behavior for the editor layout."
                    />

                    <form
                        className="space-y-6"
                        onSubmit={(event) => {
                            event.preventDefault();
                            form.patch('/settings/editor-preferences', {
                                preserveScroll: true,
                                onSuccess: () => {
                                    document.cookie = `sidebar_state=${form.data.sidebar_left_open_default}; path=/; max-age=${60 * 60 * 24 * 7}`;
                                    document.cookie = `right_sidebar_state=${form.data.sidebar_right_open_default}; path=/; max-age=${60 * 60 * 24 * 7}`;
                                },
                            });
                        }}
                    >
                        <div className="flex items-center justify-between rounded-lg border p-4">
                            <div>
                                <Label htmlFor="sidebar-left-default">
                                    Left sidebar default
                                </Label>
                                <p className="text-sm text-muted-foreground">
                                    Open or close left sidebar by default.
                                </p>
                            </div>
                            <Switch
                                id="sidebar-left-default"
                                checked={form.data.sidebar_left_open_default}
                                onCheckedChange={(checked) =>
                                    form.setData('sidebar_left_open_default', checked)
                                }
                            />
                        </div>

                        <div className="flex items-center justify-between rounded-lg border p-4">
                            <div>
                                <Label htmlFor="sidebar-right-default">
                                    Right sidebar default
                                </Label>
                                <p className="text-sm text-muted-foreground">
                                    Open or close right sidebar by default.
                                </p>
                            </div>
                            <Switch
                                id="sidebar-right-default"
                                checked={form.data.sidebar_right_open_default}
                                onCheckedChange={(checked) =>
                                    form.setData('sidebar_right_open_default', checked)
                                }
                            />
                        </div>

                        <Button type="submit" disabled={form.processing}>
                            Save preferences
                        </Button>
                    </form>
                </div>
            </SettingsLayout>
        </AppLayout>
    );
}
