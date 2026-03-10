import {
    ChevronDown,
    ChevronRight,
    Circle,
    CircleCheckBig,
    CircleChevronRight,
    CircleX,
} from 'lucide-react';
import { useMemo, useState } from 'react';

type TaskStats = {
    total: number;
    closed: number;
    open: number;
    canceled: number;
    migrated: number;
    completed: number;
};

export function StatusBarTaskCounter({ stats }: { stats: TaskStats }) {
    const [expanded, setExpanded] = useState(false);

    const detailItems = useMemo(
        () =>
            [
                {
                    key: 'open',
                    count: stats.open,
                    label: 'open',
                    icon: Circle,
                },
                {
                    key: 'canceled',
                    count: stats.canceled,
                    label: 'canceled',
                    icon: CircleX,
                },
                {
                    key: 'migrated',
                    count: stats.migrated,
                    label: 'migrated',
                    icon: CircleChevronRight,
                },
                {
                    key: 'closed',
                    count: stats.completed,
                    label: 'closed',
                    icon: CircleCheckBig,
                },
            ].filter((item) => item.count > 0),
        [stats.canceled, stats.completed, stats.migrated, stats.open],
    );

    return (
        <div className="flex items-center gap-2">
            <button
                type="button"
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                onClick={() => setExpanded((value) => !value)}
                aria-expanded={expanded}
                aria-label="Toggle task status details"
            >
                <span>
                    Tasks {stats.closed}/{stats.total}
                </span>
                {expanded ? (
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                ) : (
                    <ChevronRight className="size-3.5 text-muted-foreground" />
                )}
            </button>

            {expanded && detailItems.length > 0 ? (
                <div className="flex items-center gap-3">
                    {detailItems.map((item) => {
                        const Icon = item.icon;

                        return (
                            <span
                                key={item.key}
                                className="inline-flex items-center gap-1"
                            >
                                <Icon className="size-3.5 text-muted-foreground" />
                                <span>
                                    {item.count} {item.label}
                                </span>
                            </span>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}
