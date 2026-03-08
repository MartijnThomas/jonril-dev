import { Link } from '@inertiajs/react';
import { format, parseISO } from 'date-fns';
import { enUS, nl } from 'date-fns/locale';
import { Fragment } from 'react';

export type TaskRenderFragment = {
    type:
        | 'text'
        | 'mention'
        | 'hashtag'
        | 'wikilink'
        | 'due_date_token'
        | 'deadline_date_token'
        | 'priority_token'
        | 'status_token';
    text?: string;
    label?: string;
    note_id?: string | null;
    href?: string | null;
    date?: string;
    value?: string;
    priority?: 'high' | 'medium' | 'normal' | null;
    status?: 'canceled' | 'deferred' | 'starred' | 'question' | null;
};

type TaskInlineContentProps = {
    fragments: TaskRenderFragment[];
    language?: 'nl' | 'en';
    className?: string;
    priorityStyle?: 'token' | 'range';
    canceled?: boolean;
};

export function TaskInlineContent({
    fragments,
    language = 'nl',
    className = '',
    priorityStyle = 'token',
    canceled = false,
}: TaskInlineContentProps) {
    const dateLocale = language === 'en' ? enUS : nl;
    const formatReadableDate = (value: string) => {
        try {
            return format(parseISO(value), 'd MMMM yyyy', { locale: dateLocale });
        } catch {
            return value;
        }
    };

    const classForPriority = (priority: TaskRenderFragment['priority']) => {
        if (priority === 'high') {
            return 'md-priority-range md-priority-range--high';
        }

        if (priority === 'medium') {
            return 'md-priority-range md-priority-range--medium';
        }

        return 'md-priority-range md-priority-range--normal';
    };

    let activePriority: TaskRenderFragment['priority'] = null;

    return (
        <span
            className={`task-inline ${canceled ? 'task-inline--canceled' : ''} ${className}`.trim()}
        >
            {fragments.map((fragment, index) => {
                if (priorityStyle === 'range' && fragment.type === 'priority_token') {
                    const value = fragment.value ?? '';
                    const priority = fragment.priority ?? 'normal';
                    activePriority = priority;

                    return (
                        <span
                            key={`priority-${index}`}
                            className={classForPriority(priority)}
                        >
                            {value}
                        </span>
                    );
                }

                if (fragment.type === 'text') {
                    const content = (
                        <Fragment key={`text-${index}`}>
                            {fragment.text ?? ''}
                        </Fragment>
                    );

                    if (priorityStyle === 'range' && activePriority) {
                        return (
                            <span
                                key={`text-range-${index}`}
                                className={classForPriority(activePriority)}
                            >
                                {content}
                            </span>
                        );
                    }

                    return content;
                }

                if (fragment.type === 'mention') {
                    const label = (fragment.label ?? '').trim();
                    if (!label) {
                        return null;
                    }

                    const content = (
                        <span key={`mention-${index}`} className="mention">
                            @{label}
                        </span>
                    );

                    if (priorityStyle === 'range' && activePriority) {
                        return (
                            <span
                                key={`mention-range-${index}`}
                                className={classForPriority(activePriority)}
                            >
                                {content}
                            </span>
                        );
                    }

                    return content;
                }

                if (fragment.type === 'hashtag') {
                    const label = (fragment.label ?? '').trim();
                    if (!label) {
                        return null;
                    }

                    const content = (
                        <span key={`hashtag-${index}`} className="hashtag">
                            #{label}
                        </span>
                    );

                    if (priorityStyle === 'range' && activePriority) {
                        return (
                            <span
                                key={`hashtag-range-${index}`}
                                className={classForPriority(activePriority)}
                            >
                                {content}
                            </span>
                        );
                    }

                    return content;
                }

                if (fragment.type === 'wikilink') {
                    const text = fragment.text ?? '';
                    const href = (fragment.href ?? '').trim();

                    if (!href) {
                        const content = (
                            <span key={`wikilink-${index}`} className="md-wikilink">
                                {text}
                            </span>
                        );

                        if (priorityStyle === 'range' && activePriority) {
                            return (
                                <span
                                    key={`wikilink-range-${index}`}
                                    className={classForPriority(activePriority)}
                                >
                                    {content}
                                </span>
                            );
                        }

                        return content;
                    }

                    const content = (
                        <Link
                            key={`wikilink-${index}`}
                            href={href}
                            className="md-wikilink"
                        >
                            {text}
                        </Link>
                    );

                    if (priorityStyle === 'range' && activePriority) {
                        return (
                            <span
                                key={`wikilink-link-range-${index}`}
                                className={classForPriority(activePriority)}
                            >
                                {content}
                            </span>
                        );
                    }

                    return content;
                }

                if (fragment.type === 'due_date_token') {
                    const date = (fragment.date ?? '').trim();
                    if (!date) {
                        return null;
                    }

                    const content = (
                        <span key={`due-${index}`} className="md-task-due-token">
                            &gt;{formatReadableDate(date)}
                        </span>
                    );

                    if (priorityStyle === 'range' && activePriority) {
                        return (
                            <span
                                key={`due-range-${index}`}
                                className={classForPriority(activePriority)}
                            >
                                {content}
                            </span>
                        );
                    }

                    return content;
                }

                if (fragment.type === 'deadline_date_token') {
                    const date = (fragment.date ?? '').trim();
                    if (!date) {
                        return null;
                    }

                    const content = (
                        <span key={`deadline-${index}`} className="md-task-deadline-token">
                            &gt;&gt;{formatReadableDate(date)}
                        </span>
                    );

                    if (priorityStyle === 'range' && activePriority) {
                        return (
                            <span
                                key={`deadline-range-${index}`}
                                className={classForPriority(activePriority)}
                            >
                                {content}
                            </span>
                        );
                    }

                    return content;
                }

                if (fragment.type === 'priority_token') {
                    const value = (fragment.value ?? '').trim();
                    if (!value) {
                        return null;
                    }

                    const className =
                        fragment.priority === 'high'
                            ? 'md-priority md-priority--critical md-priority-token md-priority-token--high'
                            : fragment.priority === 'medium'
                              ? 'md-priority md-priority--medium md-priority-token md-priority-token--medium'
                              : 'md-priority md-priority--low md-priority-token md-priority-token--normal';

                    return (
                        <span key={`priority-${index}`} className={className}>
                            {value}
                        </span>
                    );
                }

                if (fragment.type === 'status_token') {
                    const value = (fragment.value ?? '').trim();
                    if (!value) {
                        return null;
                    }

                    const statusClass = fragment.status
                        ? `md-task-status-token md-task-status-token--${fragment.status}`
                        : 'md-task-status-token';

                    const content = (
                        <span key={`status-${index}`} className={statusClass}>
                            {value}
                        </span>
                    );

                    if (priorityStyle === 'range' && activePriority) {
                        return (
                            <span
                                key={`status-range-${index}`}
                                className={classForPriority(activePriority)}
                            >
                                {content}
                            </span>
                        );
                    }

                    return content;
                }

                return null;
            })}
        </span>
    );
}
