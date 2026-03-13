import type { Editor } from '@tiptap/react';
import {
    Bold,
    Code2,
    Heading1,
    Heading2,
    Heading3,
    Heading4,
    Heading5,
    Heading6,
    Highlighter,
    Italic,
    IndentDecrease,
    IndentIncrease,
    List,
    ListOrdered,
    Pilcrow,
    Quote,
    Strikethrough,
    Underline,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
    convertCurrentHeadingToParagraph,
    getCurrentBlockNode,
    normalizeParagraphAttrs,
    setCurrentHeadingLevel,
    setCurrentParagraphStyle,
} from '@/components/tiptap-templates/simple/block-tree/block-tree-model';
import { Button } from '@/components/ui/button';

const BLOCK_NODE_OPTIONS = [
    { value: 'paragraph', label: 'Paragraph', icon: Pilcrow },
    { value: 'bullet', label: 'Bullet list item', icon: List },
    { value: 'ordered', label: 'Ordered list item', icon: ListOrdered },
    { value: 'quote', label: 'Block quote', icon: Quote },
    { value: 'heading-1', label: 'H1', icon: Heading1 },
    { value: 'heading-2', label: 'H2', icon: Heading2 },
    { value: 'heading-3', label: 'H3', icon: Heading3 },
    { value: 'heading-4', label: 'H4', icon: Heading4 },
    { value: 'heading-5', label: 'H5', icon: Heading5 },
    { value: 'heading-6', label: 'H6', icon: Heading6 },
] as const;

const BLOCK_MARK_OPTIONS = [
    { value: 'bold', label: 'Bold', icon: Bold },
    { value: 'code', label: 'Inline code', icon: Code2 },
    { value: 'italic', label: 'Italic', icon: Italic },
    { value: 'underline', label: 'Underline', icon: Underline },
    { value: 'strike', label: 'Strikethrough', icon: Strikethrough },
    { value: 'highlight', label: 'Highlight', icon: Highlighter },
] as const;

function getCurrentBlockValue(editor: Editor): string {
    const currentBlock = getCurrentBlockNode(editor);

    if (!currentBlock) {
        return 'paragraph';
    }

    if (currentBlock.type === 'heading') {
        const level = Number(currentBlock.node.attrs.level ?? 1);

        return `heading-${Math.min(6, Math.max(1, level))}`;
    }

    const attrs = normalizeParagraphAttrs(currentBlock.node.attrs);

    return attrs.blockStyle;
}

function getCurrentBlockIndent(editor: Editor): number {
    const currentBlock = getCurrentBlockNode(editor);

    if (!currentBlock || currentBlock.type !== 'paragraph') {
        return 0;
    }

    return Number(currentBlock.node.attrs.indent ?? 0);
}

function getCurrentBlockDebugLabel(editor: Editor): string {
    const currentBlock = getCurrentBlockNode(editor);

    if (!currentBlock) {
        return 'unknown';
    }

    if (currentBlock.type === 'heading') {
        const level = Number(currentBlock.node.attrs.level ?? 1);

        return `type=heading kind=h${Math.min(6, Math.max(1, level))}`;
    }

    const attrs = normalizeParagraphAttrs(currentBlock.node.attrs);

    return `type=paragraph kind=${attrs.blockStyle}`;
}

function getCurrentCursorOffset(editor: Editor): number {
    return editor.state.selection.$from.parentOffset;
}

function canToggleMark(editor: Editor, mark: BlockMarkType): boolean {
    return editor.isEditable && editor.can().chain().focus().toggleMark(mark).run();
}

function getCurrentMarkState(editor: Editor): Record<BlockMarkType, boolean> {
    return {
        bold: editor.isActive('bold'),
        code: editor.isActive('code'),
        italic: editor.isActive('italic'),
        underline: editor.isActive('underline'),
        strike: editor.isActive('strike'),
        highlight: editor.isActive('highlight'),
    };
}

type BlockMarkType = (typeof BLOCK_MARK_OPTIONS)[number]['value'];

type BlockNodeToolbarProps = {
    editor: Editor;
};

export function BlockNodeToolbar({
    editor,
}: BlockNodeToolbarProps) {
    const [currentValue, setCurrentValue] = useState(() =>
        getCurrentBlockValue(editor),
    );
    const [currentIndent, setCurrentIndent] = useState(() =>
        getCurrentBlockIndent(editor),
    );
    const [currentBlockLabel, setCurrentBlockLabel] = useState(() =>
        getCurrentBlockDebugLabel(editor),
    );
    const [currentCursorOffset, setCurrentCursorOffset] = useState(() =>
        getCurrentCursorOffset(editor),
    );
    const [currentMarks, setCurrentMarks] = useState<Record<BlockMarkType, boolean>>(() =>
        getCurrentMarkState(editor),
    );

    useEffect(() => {
        const updateValue = () => {
            setCurrentValue(getCurrentBlockValue(editor));
            setCurrentIndent(getCurrentBlockIndent(editor));
            setCurrentBlockLabel(getCurrentBlockDebugLabel(editor));
            setCurrentCursorOffset(getCurrentCursorOffset(editor));
            setCurrentMarks(getCurrentMarkState(editor));
        };

        updateValue();
        editor.on('selectionUpdate', updateValue);
        editor.on('update', updateValue);

        return () => {
            editor.off('selectionUpdate', updateValue);
            editor.off('update', updateValue);
        };
    }, [editor]);

    const handleValueChange = (value: string) => {
        const currentBlock = getCurrentBlockNode(editor);
        const currentValue = getCurrentBlockValue(editor);

        if (value === 'paragraph') {
            if (currentBlock?.type === 'paragraph') {
                setCurrentParagraphStyle(editor, 'paragraph');
                return;
            }

            editor.chain().focus().setNode('paragraph', normalizeParagraphAttrs({})).run();
            return;
        }

        if (value === 'bullet' || value === 'ordered' || value === 'quote') {
            if (currentValue === value) {
                setCurrentParagraphStyle(editor, 'paragraph');
                return;
            }

            if (currentBlock?.type === 'paragraph') {
                const attrs = normalizeParagraphAttrs(currentBlock.node.attrs);

                setCurrentParagraphStyle(editor, value, {
                    order: value === 'ordered' ? Number(attrs.order ?? 1) : 1,
                });
                return;
            }

            editor.chain().focus().setNode('paragraph', normalizeParagraphAttrs({
                blockStyle: value,
            })).run();

            return;
        }

        const level = Number(value.replace('heading-', ''));

        if (currentValue === value) {
            convertCurrentHeadingToParagraph(editor);
            return;
        }

        setCurrentHeadingLevel(editor, level);
    };

    const handleMarkToggle = (mark: BlockMarkType) => {
        editor.chain().focus().toggleMark(mark).run();
    };

    const handleIndent = () => {
        editor.commands.indentBlockParagraph();
    };

    const handleDedent = () => {
        editor.commands.dedentBlockParagraph();
    };

    const currentBlock = getCurrentBlockNode(editor);
    const isParagraphBlock = currentBlock?.type === 'paragraph';

    return (
        <div className="sticky top-0 z-20 border-b border-border/70 bg-background/95 px-8 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="mx-auto w-full max-w-3xl">
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-muted/35 p-2 shadow-xs">
                    <div className="flex flex-wrap gap-2">
                        {BLOCK_NODE_OPTIONS.map((option) => {
                            const isActive = currentValue === option.value;
                            const Icon = option.icon;

                            return (
                                <Button
                                    key={option.value}
                                    type="button"
                                    size="sm"
                                    variant={isActive ? 'default' : 'ghost'}
                                    className={
                                        isActive
                                            ? 'rounded-lg shadow-xs'
                                            : 'rounded-lg text-muted-foreground hover:text-foreground'
                                    }
                                    onClick={() => handleValueChange(option.value)}
                                    aria-pressed={isActive}
                                    aria-label={option.label}
                                    title={option.label}
                                >
                                    <Icon className="size-4" />
                                    <span className="sr-only">{option.label}</span>
                                </Button>
                            );
                        })}
                    </div>

                    <div className="h-7 w-px bg-border/70" />

                    <div className="flex flex-wrap gap-2">
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="rounded-lg text-muted-foreground hover:text-foreground"
                            onClick={handleIndent}
                            aria-label="Indent block"
                            title="Indent block"
                            disabled={!isParagraphBlock}
                        >
                            <IndentIncrease className="size-4" />
                            <span className="sr-only">Indent block</span>
                        </Button>

                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="rounded-lg text-muted-foreground hover:text-foreground"
                            onClick={handleDedent}
                            aria-label="Dedent block"
                            title="Dedent block"
                            disabled={!isParagraphBlock}
                        >
                            <IndentDecrease className="size-4" />
                            <span className="sr-only">Dedent block</span>
                        </Button>
                    </div>

                    <div className="h-7 w-px bg-border/70" />

                    <div className="flex flex-wrap gap-2">
                        {BLOCK_MARK_OPTIONS.map((option) => {
                            const isActive = currentMarks[option.value];
                            const isDisabled = !canToggleMark(editor, option.value);
                            const Icon = option.icon;

                            return (
                                <Button
                                    key={option.value}
                                    type="button"
                                    size="sm"
                                    variant={isActive ? 'default' : 'ghost'}
                                    className={
                                        isActive
                                            ? 'rounded-lg shadow-xs'
                                            : 'rounded-lg text-muted-foreground hover:text-foreground'
                                    }
                                    onClick={() => handleMarkToggle(option.value)}
                                    aria-pressed={isActive}
                                    aria-label={option.label}
                                    title={option.label}
                                    disabled={isDisabled}
                                >
                                    <Icon className="size-4" />
                                    <span className="sr-only">{option.label}</span>
                                </Button>
                            );
                        })}
                    </div>
                </div>

                <div className="pt-2 text-xs text-muted-foreground">
                    Indent: {currentIndent} | Node: {currentBlockLabel} | Offset: {currentCursorOffset}
                </div>
            </div>
        </div>
    );
}
