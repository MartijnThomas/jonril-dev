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
        | 'deadline_date_token';
    text?: string;
    label?: string;
    note_id?: string | null;
    href?: string | null;
    date?: string;
};

type TaskInlineContentProps = {
    fragments: TaskRenderFragment[];
    language?: 'nl' | 'en';
    className?: string;
};

export function TaskInlineContent({
    fragments,
    language = 'nl',
    className = '',
}: TaskInlineContentProps) {
    const dateLocale = language === 'en' ? enUS : nl;
    const formatReadableDate = (value: string) => {
        try {
            return format(parseISO(value), 'd MMMM yyyy', { locale: dateLocale });
        } catch {
            return value;
        }
    };

    return (
        <span className={`task-inline ${className}`.trim()}>
            {fragments.map((fragment, index) => {
                if (fragment.type === 'text') {
                    return (
                        <Fragment key={`text-${index}`}>
                            {fragment.text ?? ''}
                        </Fragment>
                    );
                }

                if (fragment.type === 'mention') {
                    const label = (fragment.label ?? '').trim();
                    if (!label) {
                        return null;
                    }

                    return (
                        <span key={`mention-${index}`} className="mention">
                            @{label}
                        </span>
                    );
                }

                if (fragment.type === 'hashtag') {
                    const label = (fragment.label ?? '').trim();
                    if (!label) {
                        return null;
                    }

                    return (
                        <span key={`hashtag-${index}`} className="hashtag">
                            #{label}
                        </span>
                    );
                }

                if (fragment.type === 'wikilink') {
                    const text = fragment.text ?? '';
                    const href = (fragment.href ?? '').trim();

                    if (!href) {
                        return (
                            <span key={`wikilink-${index}`} className="md-wikilink">
                                {text}
                            </span>
                        );
                    }

                    return (
                        <Link
                            key={`wikilink-${index}`}
                            href={href}
                            className="md-wikilink"
                        >
                            {text}
                        </Link>
                    );
                }

                if (fragment.type === 'due_date_token') {
                    const date = (fragment.date ?? '').trim();
                    if (!date) {
                        return null;
                    }

                    return (
                        <span key={`due-${index}`} className="md-task-due-token">
                            &gt;{formatReadableDate(date)}
                        </span>
                    );
                }

                if (fragment.type === 'deadline_date_token') {
                    const date = (fragment.date ?? '').trim();
                    if (!date) {
                        return null;
                    }

                    return (
                        <span key={`deadline-${index}`} className="md-task-deadline-token">
                            &gt;&gt;{formatReadableDate(date)}
                        </span>
                    );
                }

                return null;
            })}
        </span>
    );
}
