import { Link, usePage } from '@inertiajs/react';
import { format, getISOWeek, getISOWeekYear } from 'date-fns';
import {
    Calendar,
    CalendarDays,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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
import { cn } from '@/lib/utils';

type BadgeIconProps = {
    className?: string;
};

function CalendarBadgeIcon({
    className,
    badge,
    icon: Icon = Calendar,
}: BadgeIconProps & { badge: string; icon?: LucideIcon }) {
    return (
        <span className={cn('relative inline-flex h-4 w-4 items-center justify-center', className)}>
            <Icon className="size-4" />
            <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[8px] leading-none font-medium">
                {badge}
            </span>
        </span>
    );
}

export function NavJournalLinks() {
    const { t } = useI18n();
    const pageProps = usePage().props as {
        currentWorkspace?: {
            slug?: string;
        } | null;
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
    const workspaceSlug =
        typeof pageProps.currentWorkspace?.slug === 'string' &&
        pageProps.currentWorkspace.slug.trim() !== ''
            ? pageProps.currentWorkspace.slug.trim()
            : null;
    const journalBase = workspaceSlug ? `/w/${workspaceSlug}/journal` : '/journal';
    const today = new Date();
    const isoYear = getISOWeekYear(today);
    const isoWeek = String(getISOWeek(today)).padStart(2, '0');
    const dayNumber = format(today, 'd');
    const dailyIconName = pageProps.auth?.user?.settings?.editor?.journal_icons?.daily ?? null;
    const weeklyIconName = pageProps.auth?.user?.settings?.editor?.journal_icons?.weekly ?? null;
    const monthlyIconName = pageProps.auth?.user?.settings?.editor?.journal_icons?.monthly ?? null;
    const yearlyIconName = pageProps.auth?.user?.settings?.editor?.journal_icons?.yearly ?? null;

    const DailyIcon =
        !dailyIconName || dailyIconName === 'calendar' || dailyIconName === 'calendar_days'
            ? (props: BadgeIconProps) => <CalendarBadgeIcon {...props} badge={dayNumber} icon={Calendar} />
            : getLucideIconComponent(dailyIconName, CalendarDays);
    const WeeklyIcon =
        !weeklyIconName || weeklyIconName === 'calendar' || weeklyIconName === 'calendar_range'
            ? (props: BadgeIconProps) => <CalendarBadgeIcon {...props} badge="W" icon={Calendar} />
            : getLucideIconComponent(weeklyIconName, CalendarDays);
    const MonthlyIcon =
        !monthlyIconName || monthlyIconName === 'calendar_days' || monthlyIconName === 'calendar_sync'
            ? CalendarDays
            : getLucideIconComponent(monthlyIconName, CalendarDays);
    const YearlyIcon =
        !yearlyIconName || yearlyIconName === 'calendar' || yearlyIconName === 'calendar_1'
            ? (props: BadgeIconProps) => <CalendarBadgeIcon {...props} badge="Y" icon={Calendar} />
            : getLucideIconComponent(yearlyIconName, CalendarDays);
    const dailyColorClass = getColorTextClass(
        pageProps.auth?.user?.settings?.editor?.journal_icon_colors?.daily ?? 'default',
    );
    const weeklyColorClass = getColorTextClass(
        pageProps.auth?.user?.settings?.editor?.journal_icon_colors?.weekly ?? 'default',
    );
    const monthlyColorClass = getColorTextClass(
        pageProps.auth?.user?.settings?.editor?.journal_icon_colors?.monthly ?? 'default',
    );
    const yearlyColorClass = getColorTextClass(
        pageProps.auth?.user?.settings?.editor?.journal_icon_colors?.yearly ?? 'default',
    );

    const items = [
        {
            title: t('journal_nav.daily', 'Daily'),
            href: `${journalBase}/daily/${format(today, 'yyyy-MM-dd')}`,
            icon: DailyIcon,
            iconClassName: dailyColorClass,
        },
        {
            title: t('journal_nav.weekly', 'Weekly'),
            href: `${journalBase}/weekly/${isoYear}-W${isoWeek}`,
            icon: WeeklyIcon,
            iconClassName: weeklyColorClass,
        },
        {
            title: t('journal_nav.monthly', 'Monthly'),
            href: `${journalBase}/monthly/${format(today, 'yyyy-MM')}`,
            icon: MonthlyIcon,
            iconClassName: monthlyColorClass,
        },
        {
            title: t('journal_nav.yearly', 'Yearly'),
            href: `${journalBase}/yearly/${format(today, 'yyyy')}`,
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
