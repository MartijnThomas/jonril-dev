import { Link } from '@inertiajs/react';
import { format, getISOWeek, getISOWeekYear } from 'date-fns';
import {
    CalendarDays,
    CalendarRange,
    CalendarSync,
    Calendar1,
} from 'lucide-react';
import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useCurrentUrl } from '@/hooks/use-current-url';

export function NavJournalLinks() {
    const { isCurrentUrl } = useCurrentUrl();
    const today = new Date();
    const isoYear = getISOWeekYear(today);
    const isoWeek = String(getISOWeek(today)).padStart(2, '0');

    const items = [
        {
            title: 'Daily',
            href: `/journal/daily/${format(today, 'yyyy-MM-dd')}`,
            icon: CalendarDays,
        },
        {
            title: 'Weekly',
            href: `/journal/weekly/${isoYear}-W${isoWeek}`,
            icon: CalendarRange,
        },
        {
            title: 'Monthly',
            href: `/journal/monthly/${format(today, 'yyyy-MM')}`,
            icon: CalendarSync,
        },
        {
            title: 'Yearly',
            href: `/journal/yearly/${format(today, 'yyyy')}`,
            icon: Calendar1,
        },
    ];

    return (
        <SidebarGroup className="px-2 py-0">
            <SidebarGroupLabel>Journals</SidebarGroupLabel>
            <SidebarMenu>
                {items.map((item) => (
                    <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                            asChild
                            isActive={isCurrentUrl(item.href)}
                            tooltip={{ children: item.title }}
                        >
                            <Link href={item.href} prefetch>
                                <item.icon />
                                <span>{item.title}</span>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                ))}
            </SidebarMenu>
        </SidebarGroup>
    );
}
