<?php

namespace App\Support\Notes;

use App\Models\Event;
use App\Models\Note;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

class BirthdayEventIndexer
{
    public const BLOCK_ID = 'birthday';

    public function reindexNote(Note $note): void
    {
        DB::transaction(function () use ($note): void {
            if ($note->trashed()) {
                $this->deleteNoteBirthdayEvents($note);

                return;
            }

            $monthDay = $this->extractBirthdayMonthDay($note);
            if ($monthDay === null) {
                $this->deleteNoteBirthdayEvents($note);

                return;
            }

            $year = (int) now('UTC')->year;
            $month = $monthDay['month'];
            $day = $monthDay['day'];

            if (! checkdate($month, $day, $year)) {
                if ($month === 2 && $day === 29) {
                    $day = 28;
                } else {
                    $this->deleteNoteBirthdayEvents($note);

                    return;
                }
            }

            $startsAt = CarbonImmutable::create($year, $month, $day, 0, 0, 0, 'UTC');
            $endsAt = $startsAt->addDay();

            Event::query()->updateOrCreate(
                [
                    'note_id' => $note->id,
                    'eventable_type' => Note::class,
                    'block_id' => self::BLOCK_ID,
                ],
                [
                    'workspace_id' => $note->workspace_id,
                    'eventable_id' => $note->id,
                    'title' => $note->display_title,
                    'starts_at' => $startsAt,
                    'ends_at' => $endsAt,
                    'all_day' => true,
                    'timezone' => 'UTC',
                    'journal_date' => null,
                    'meta' => [
                        'source' => 'properties',
                        'event_type' => 'birthday',
                        'birthday_month' => $monthDay['month'],
                        'birthday_day' => $monthDay['day'],
                        'birthday_value' => $monthDay['raw'],
                    ],
                    'remote_deleted_at' => null,
                ],
            );
        });
    }

    public function deleteNoteBirthdayEvents(Note $note): void
    {
        Event::query()
            ->where('note_id', $note->id)
            ->where('eventable_type', Note::class)
            ->where('block_id', self::BLOCK_ID)
            ->delete();
    }

    /**
     * @return array{month: int, day: int, raw: string}|null
     */
    private function extractBirthdayMonthDay(Note $note): ?array
    {
        if (! is_array($note->properties)) {
            return null;
        }

        $propertyType = strtolower(trim((string) ($note->properties['type'] ?? '')));
        if ($propertyType !== 'person') {
            return null;
        }

        $rawBirthday = trim((string) ($note->properties['birthday'] ?? ''));
        if ($rawBirthday === '') {
            return null;
        }

        if (preg_match('/^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/', $rawBirthday, $parts) === 1) {
            $month = (int) ($parts['month'] ?? 0);
            $day = (int) ($parts['day'] ?? 0);
            if ($month >= 1 && $month <= 12 && $day >= 1 && $day <= 31) {
                return [
                    'month' => $month,
                    'day' => $day,
                    'raw' => $rawBirthday,
                ];
            }
        }

        if (preg_match('/^(?<month>\d{1,2})-(?<day>\d{1,2})$/', $rawBirthday, $parts) === 1) {
            $month = (int) ($parts['month'] ?? 0);
            $day = (int) ($parts['day'] ?? 0);
            if ($month >= 1 && $month <= 12 && $day >= 1 && $day <= 31) {
                return [
                    'month' => $month,
                    'day' => $day,
                    'raw' => $rawBirthday,
                ];
            }
        }

        if (preg_match('/^(?<day>\d{1,2})[\/\-.](?<month>\d{1,2})(?:[\/\-.](?<year>\d{2,4}))?$/', $rawBirthday, $parts) === 1) {
            $day = (int) ($parts['day'] ?? 0);
            $month = (int) ($parts['month'] ?? 0);
            if ($month >= 1 && $month <= 12 && $day >= 1 && $day <= 31) {
                return [
                    'month' => $month,
                    'day' => $day,
                    'raw' => $rawBirthday,
                ];
            }
        }

        try {
            $parsed = CarbonImmutable::parse($rawBirthday);

            return [
                'month' => (int) $parsed->month,
                'day' => (int) $parsed->day,
                'raw' => $rawBirthday,
            ];
        } catch (\Throwable) {
            return null;
        }
    }
}
