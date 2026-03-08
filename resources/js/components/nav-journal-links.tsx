import { Link, usePage } from '@inertiajs/react';
import { format, getISOWeek, getISOWeekYear } from 'date-fns';
import {
    CalendarDays,
    CalendarRange,
    CalendarSync,
    Calendar1,
} from 'lucide-react';
import { getColorTextClass } from '@/components/color-swatch-picker';
import { getLucideIconComponent } from '@/components/icon-picker';
import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useCurrentUrl } from '@/hooks/use-current-url';
import { useI18n } from '@/lib/i18n';

export function NavJournalLinks() {
    const { t } = useI18n();
    const pageProps = usePage().props as {
        auth?: {
            user?: {
                settings?: {
                    editor?: {
                        journal_icons?: {
                            daily?: string;
                            weekly?: string;
                            monthly?: string;
                            yearly?: string;
                        };
                        journal_icon_colors?: {
                            daily?: string;
                            weekly?: string;
                            monthly?: string;
                            yearly?: string;
                        };
                    };
                };
            };
        };
    };
    const { isCurrentUrl } = useCurrentUrl();
    const today = new Date();
    const isoYear = getISOWeekYear(today);
    const isoWeek = String(getISOWeek(today)).padStart(2, '0');
    const DailyIcon = getLucideIconComponent(
        pageProps.auth?.user?.settings?.editor?.journal_icons?.daily ?? null,
        CalendarDays,
    );
    const WeeklyIcon = getLucideIconComponent(
        pageProps.auth?.user?.settings?.editor?.journal_icons?.weekly ?? null,
        CalendarRange,
    );
    const MonthlyIcon = getLucideIconComponent(
        pageProps.auth?.user?.settings?.editor?.journal_icons?.monthly ?? null,
        CalendarSync,
    );
    const YearlyIcon = getLucideIconComponent(
        pageProps.auth?.user?.settings?.editor?.journal_icons?.yearly ?? null,
        Calendar1,
    );
    const dailyColorClass = getColorTextClass(
        pageProps.auth?.user?.settings?.editor?.journal_icon_colors?.daily ?? 'black',
    );
    const weeklyColorClass = getColorTextClass(
        pageProps.auth?.user?.settings?.editor?.journal_icon_colors?.weekly ?? 'black',
    );
    const monthlyColorClass = getColorTextClass(
        pageProps.auth?.user?.settings?.editor?.journal_icon_colors?.monthly ?? 'black',
    );
    const yearlyColorClass = getColorTextClass(
        pageProps.auth?.user?.settings?.editor?.journal_icon_colors?.yearly ?? 'black',
    );

    const items = [
        {
            title: t('journal_nav.daily', 'Daily'),
            href: `/journal/daily/${format(today, 'yyyy-MM-dd')}`,
            icon: DailyIcon,
            iconClassName: dailyColorClass,
        },
        {
            title: t('journal_nav.weekly', 'Weekly'),
            href: `/journal/weekly/${isoYear}-W${isoWeek}`,
            icon: WeeklyIcon,
            iconClassName: weeklyColorClass,
        },
        {
            title: t('journal_nav.monthly', 'Monthly'),
            href: `/journal/monthly/${format(today, 'yyyy-MM')}`,
            icon: MonthlyIcon,
            iconClassName: monthlyColorClass,
        },
        {
            title: t('journal_nav.yearly', 'Yearly'),
            href: `/journal/yearly/${format(today, 'yyyy')}`,
            icon: YearlyIcon,
            iconClassName: yearlyColorClass,
        },
    ];

    return (
        <SidebarGroup className="px-2 py-0">
            <SidebarGroupLabel>{t('journal_nav.group_label', 'Journals')}</SidebarGroupLabel>
            <SidebarMenu>
                {items.map((item) => (
                    <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                            asChild
                            isActive={isCurrentUrl(item.href)}
                            tooltip={{ children: item.title }}
                        >
                            <Link href={item.href} prefetch>
                                <item.icon className={item.iconClassName} />
                                <span>{item.title}</span>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                ))}
            </SidebarMenu>
        </SidebarGroup>
    );
}
