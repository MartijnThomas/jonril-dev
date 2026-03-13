export type BlockInlineTokenKind = 'mention' | 'hashtag';

export type BlockInlineTokenRange = {
    from: number;
    to: number;
    kind: BlockInlineTokenKind;
};

const INLINE_TOKEN_PATTERN = /(^|[^\p{L}\p{N}_-])([@#][\p{L}\p{N}_-]+)/gu;

export function findBlockInlineTokenRanges(text: string): BlockInlineTokenRange[] {
    const ranges: BlockInlineTokenRange[] = [];

    for (const match of text.matchAll(INLINE_TOKEN_PATTERN)) {
        const boundary = match[1] ?? '';
        const token = match[2] ?? '';

        if (token.length < 2) {
            continue;
        }

        const start = (match.index ?? 0) + boundary.length;
        const end = start + token.length;

        ranges.push({
            from: start,
            to: end,
            kind: token.startsWith('@') ? 'mention' : 'hashtag',
        });
    }

    return ranges;
}
