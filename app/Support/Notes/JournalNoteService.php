<?php

namespace App\Support\Notes;

use App\Models\Note;
use App\Models\Workspace;
use Carbon\CarbonImmutable;
use Illuminate\Support\Str;
use InvalidArgumentException;

class JournalNoteService
{
    public function resolveOrCreate(Workspace $workspace, string $granularity, string $period, ?string $locale = null): Note
    {
        $normalizedGranularity = $this->normalizeGranularity($granularity);
        $date = $this->parsePeriod($normalizedGranularity, $period);

        $existing = Note::query()
            ->where('workspace_id', $workspace->id)
            ->where('type', Note::TYPE_JOURNAL)
            ->where('journal_granularity', $normalizedGranularity)
            ->whereDate('journal_date', $date->toDateString())
            ->first();

        if ($existing) {
            $this->syncJournalMetadata($existing, $normalizedGranularity, $date);

            return $existing;
        }

        $title = $this->titleFor($normalizedGranularity, $date, $locale);

        return $workspace->notes()->create([
            'type' => Note::TYPE_JOURNAL,
            'title' => $title,
            'slug' => $this->slugFor($normalizedGranularity, $date),
            'journal_granularity' => $normalizedGranularity,
            'journal_date' => $date->toDateString(),
            'content' => $this->defaultContent($title),
            'properties' => [],
        ]);
    }

    public function periodFor(string $granularity, mixed $journalDate): string
    {
        $normalizedGranularity = $this->normalizeGranularity($granularity);
        $date = $this->normalizeDate($journalDate);

        return match ($normalizedGranularity) {
            Note::JOURNAL_DAILY => $date->format('Y-m-d'),
            Note::JOURNAL_WEEKLY => $date->isoFormat('GGGG-[W]WW'),
            Note::JOURNAL_MONTHLY => $date->format('Y-m'),
            Note::JOURNAL_YEARLY => $date->format('Y'),
        };
    }

    public function titleFor(string $granularity, mixed $journalDate, ?string $locale = null): string
    {
        $normalizedGranularity = $this->normalizeGranularity($granularity);
        $date = $this->normalizeDate($journalDate)->locale($this->normalizeLocale($locale));

        return match ($normalizedGranularity) {
            Note::JOURNAL_DAILY => Str::ucfirst($date->isoFormat('dddd D MMMM YYYY')),
            Note::JOURNAL_WEEKLY => "Week {$date->isoWeek()} {$date->isoWeekYear()}",
            Note::JOURNAL_MONTHLY => Str::ucfirst($date->isoFormat('MMMM YYYY')),
            Note::JOURNAL_YEARLY => $date->format('Y'),
        };
    }

    private function normalizeLocale(?string $locale): string
    {
        $normalized = strtolower(trim((string) $locale));

        return in_array($normalized, ['nl', 'en'], true) ? $normalized : 'nl';
    }

    public function parsePeriod(string $granularity, string $period): CarbonImmutable
    {
        $normalizedGranularity = $this->normalizeGranularity($granularity);

        return match ($normalizedGranularity) {
            Note::JOURNAL_DAILY => $this->parseDaily($period),
            Note::JOURNAL_WEEKLY => $this->parseWeekly($period),
            Note::JOURNAL_MONTHLY => $this->parseMonthly($period),
            Note::JOURNAL_YEARLY => $this->parseYearly($period),
        };
    }

    private function slugFor(string $granularity, CarbonImmutable $date): string
    {
        return "journal/{$granularity}/{$this->periodFor($granularity, $date)}";
    }

    private function normalizeGranularity(string $granularity): string
    {
        $normalized = strtolower(trim($granularity));
        $allowed = [
            Note::JOURNAL_DAILY,
            Note::JOURNAL_WEEKLY,
            Note::JOURNAL_MONTHLY,
            Note::JOURNAL_YEARLY,
        ];

        if (! in_array($normalized, $allowed, true)) {
            throw new InvalidArgumentException('Invalid journal granularity.');
        }

        return $normalized;
    }

    private function parseDaily(string $period): CarbonImmutable
    {
        $date = CarbonImmutable::createFromFormat('Y-m-d', $period);
        if (! $date || $date->format('Y-m-d') !== $period) {
            throw new InvalidArgumentException('Invalid daily period.');
        }

        return $date->startOfDay();
    }

    private function parseWeekly(string $period): CarbonImmutable
    {
        if (! preg_match('/^(?<year>\d{4})-W(?<week>\d{2})$/', $period, $matches)) {
            throw new InvalidArgumentException('Invalid weekly period.');
        }

        $year = (int) $matches['year'];
        $week = (int) $matches['week'];
        if ($week < 1 || $week > 53) {
            throw new InvalidArgumentException('Invalid weekly period.');
        }

        return CarbonImmutable::now()
            ->setISODate($year, $week)
            ->startOfWeek();
    }

    private function parseMonthly(string $period): CarbonImmutable
    {
        $date = CarbonImmutable::createFromFormat('Y-m', $period);
        if (! $date || $date->format('Y-m') !== $period) {
            throw new InvalidArgumentException('Invalid monthly period.');
        }

        return $date->startOfMonth();
    }

    private function parseYearly(string $period): CarbonImmutable
    {
        $date = CarbonImmutable::createFromFormat('Y', $period);
        if (! $date || $date->format('Y') !== $period) {
            throw new InvalidArgumentException('Invalid yearly period.');
        }

        return $date->startOfYear();
    }

    private function normalizeDate(mixed $journalDate): CarbonImmutable
    {
        if ($journalDate instanceof CarbonImmutable) {
            return $journalDate;
        }

        return CarbonImmutable::parse((string) $journalDate);
    }

    private function defaultContent(string $title): array
    {
        return [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'heading',
                    'attrs' => ['level' => 1],
                    'content' => [
                        ['type' => 'text', 'text' => $title],
                    ],
                ],
            ],
        ];
    }

    private function syncJournalMetadata(Note $note, string $granularity, CarbonImmutable $date): void
    {
        $expectedSlug = $this->slugFor($granularity, $date);
        $updated = false;

        if ($note->slug !== $expectedSlug) {
            $note->slug = $expectedSlug;
            $updated = true;
        }

        if ($note->journal_granularity !== $granularity) {
            $note->journal_granularity = $granularity;
            $updated = true;
        }

        $dateString = $date->toDateString();
        if ((string) $note->journal_date?->toDateString() !== $dateString) {
            $note->journal_date = $dateString;
            $updated = true;
        }

        if ($updated) {
            $note->save();
        }
    }
}
