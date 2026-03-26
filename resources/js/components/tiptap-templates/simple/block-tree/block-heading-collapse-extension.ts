import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';

type HeadingEntry = {
    id: string;
    type: 'heading' | 'paragraph';
    level: number;
    pos: number;
    nodeSize: number;
    endPos: number;
    hasChildren: boolean;
};

type HeadingCollapseState = {
    collapsedHeadingIds: Set<string>;
    decorations: DecorationSet;
};

const headingCollapsePluginKey = new PluginKey<HeadingCollapseState>('blockHeadingCollapse');

type ToggleCollapseMeta = {
    blockId: string;
};

function getTopLevelBlocks(doc: ProseMirrorNode): Array<{ pos: number; node: ProseMirrorNode }> {
    const blocks: Array<{ pos: number; node: ProseMirrorNode }> = [];

    doc.descendants((node, pos, parent) => {
        if (parent !== doc) {
            return false;
        }

        blocks.push({ pos, node });

        return false;
    });

    return blocks;
}

function collectHeadings(doc: ProseMirrorNode): HeadingEntry[] {
    const topLevelBlocks = getTopLevelBlocks(doc);
    const headings = topLevelBlocks
        .filter(({ node }) => node.type.name === 'heading')
        .map(({ node, pos }) => {
            const headingId = typeof node.attrs.id === 'string' && node.attrs.id.trim() !== ''
                ? node.attrs.id
                : `heading-${pos}`;

            return {
                id: headingId,
                type: 'heading',
                level: Math.max(1, Number(node.attrs.level ?? 1) || 1),
                pos,
                nodeSize: node.nodeSize,
                endPos: doc.content.size,
                hasChildren: false,
            };
        });

    headings.forEach((heading, index) => {
        const nextSameOrHigherHeading = headings
            .slice(index + 1)
            .find((nextHeading) => nextHeading.level <= heading.level);

        const contentStart = heading.pos + (doc.nodeAt(heading.pos)?.nodeSize ?? 0);
        const contentEnd = nextSameOrHigherHeading ? nextSameOrHigherHeading.pos : doc.content.size;

        heading.endPos = contentEnd;
        heading.hasChildren = contentEnd > contentStart;
    });

    return headings;
}

function collectParagraphSections(doc: ProseMirrorNode): HeadingEntry[] {
    const sections: HeadingEntry[] = [];
    const topLevelBlocks = getTopLevelBlocks(doc);

    for (let index = 0; index < topLevelBlocks.length; index += 1) {
        const current = topLevelBlocks[index];
        if (current.node.type.name !== 'paragraph') {
            continue;
        }

        const currentIndent = Math.max(0, Number(current.node.attrs.indent ?? 0) || 0);
        let endIndex = index + 1;

        while (endIndex < topLevelBlocks.length) {
            const next = topLevelBlocks[endIndex];
            if (next.node.type.name !== 'paragraph') {
                break;
            }

            const nextIndent = Math.max(0, Number(next.node.attrs.indent ?? 0) || 0);
            if (nextIndent <= currentIndent) {
                break;
            }

            endIndex += 1;
        }

        const hasChildren = endIndex > index + 1;
        if (!hasChildren) {
            continue;
        }

        const sectionId = typeof current.node.attrs.id === 'string' && current.node.attrs.id.trim() !== ''
            ? current.node.attrs.id
            : `paragraph-${current.pos}`;

        sections.push({
            id: sectionId,
            type: 'paragraph',
            level: 0,
            pos: current.pos,
            nodeSize: current.node.nodeSize,
            endPos: endIndex < topLevelBlocks.length ? topLevelBlocks[endIndex].pos : doc.content.size,
            hasChildren,
        });
    }

    return sections;
}

function collectCollapsibleEntries(doc: ProseMirrorNode): HeadingEntry[] {
    return [...collectHeadings(doc), ...collectParagraphSections(doc)];
}

function createCollapseToggleWidget(
    entry: HeadingEntry,
    collapsed: boolean,
    nodeSize: number,
): Decoration {
    return Decoration.widget(
        entry.pos + nodeSize - 1,
        () => {
            const button = document.createElement('button');
            const classes = [
                'bt-heading-collapse-toggle',
                'bt-heading-collapse-toggle--inline',
                collapsed ? 'bt-heading-collapse-toggle--collapsed' : '',
            ].filter(Boolean);

            button.type = 'button';
            button.className = classes.join(' ');
            button.contentEditable = 'false';
            button.tabIndex = -1;
            button.draggable = false;
            button.setAttribute('aria-label', collapsed ? 'Expand section' : 'Collapse section');
            button.setAttribute('title', collapsed ? 'Expand section' : 'Collapse section');
            button.setAttribute('data-bt-heading-collapse-toggle', 'true');
            button.setAttribute('data-block-id', entry.id);
            button.innerHTML =
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="bt-heading-collapse-icon" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>';

            return button;
        },
        { side: 1 },
    );
}

function createCollapsedMoreWidget(
    pos: number,
    blockId: string,
    blockType: 'heading' | 'paragraph',
): Decoration {
    const side = blockType === 'paragraph' ? -1000 : 1;

    return Decoration.widget(
        pos,
        () => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'bt-heading-collapsed-more';
            button.contentEditable = 'false';
            button.tabIndex = -1;
            button.draggable = false;
            button.setAttribute('aria-label', 'Expand section');
            button.setAttribute('title', 'Expand section');
            button.setAttribute('data-bt-heading-collapse-toggle', 'true');
            button.setAttribute('data-block-id', blockId);
            button.textContent = '•••';

            return button;
        },
        { side },
    );
}

function buildDecorations(doc: ProseMirrorNode, collapsedHeadingIds: Set<string>): DecorationSet {
    const decorations: Decoration[] = [];
    const headings = collectCollapsibleEntries(doc);
    const topLevelBlocks = getTopLevelBlocks(doc);

    headings.forEach((heading) => {
        const collapsed = collapsedHeadingIds.has(heading.id) && heading.hasChildren;
        const headingNode = doc.nodeAt(heading.pos);
        if (!headingNode) {
            return;
        }

        if (heading.hasChildren) {
            decorations.push(createCollapseToggleWidget(heading, collapsed, headingNode.nodeSize));
        }

        const headingClasses = [
            heading.type === 'heading' ? 'bt-heading-collapsible' : 'bt-paragraph-collapsible',
        ];
        if (heading.hasChildren) {
            headingClasses.push('bt-heading-has-children');
        }
        if (collapsed) {
            headingClasses.push('bt-heading-collapsed');
        }

        decorations.push(
            Decoration.node(heading.pos, heading.pos + headingNode.nodeSize, {
                class: headingClasses.join(' '),
                'data-bt-collapse-id': heading.id,
            }),
        );

        if (!collapsed) {
            return;
        }

        decorations.push(
            createCollapsedMoreWidget(
                heading.pos + headingNode.nodeSize - 1,
                heading.id,
                heading.type,
            ),
        );

        const contentStart = heading.pos + headingNode.nodeSize;
        topLevelBlocks.forEach((block) => {
            if (block.pos < contentStart || block.pos >= heading.endPos) {
                return;
            }

            decorations.push(
                Decoration.node(block.pos, block.pos + block.node.nodeSize, {
                    class: 'bt-collapsed-hidden',
                    'data-bt-hidden-by-block': heading.id,
                }),
            );
        });
    });

    return DecorationSet.create(doc, decorations);
}

function createState(doc: ProseMirrorNode, collapsedHeadingIds: Set<string>): HeadingCollapseState {
    const headings = collectCollapsibleEntries(doc);
    const existingHeadingIds = new Set(headings.map((heading) => heading.id));
    const prunedCollapsedIds = new Set<string>();

    collapsedHeadingIds.forEach((headingId) => {
        if (existingHeadingIds.has(headingId)) {
            prunedCollapsedIds.add(headingId);
        }
    });

    return {
        collapsedHeadingIds: prunedCollapsedIds,
        decorations: buildDecorations(doc, prunedCollapsedIds),
    };
}

function toggleHeadingCollapse(view: EditorView, blockId: string): boolean {
    const currentState = headingCollapsePluginKey.getState(view.state);
    if (!currentState) {
        return false;
    }

    const transaction = view.state.tr.setMeta(headingCollapsePluginKey, {
        blockId,
    } satisfies ToggleCollapseMeta);
    view.dispatch(transaction);

    return true;
}

export const BlockHeadingCollapseExtension = Extension.create({
    name: 'blockHeadingCollapseExtension',

    addProseMirrorPlugins() {
        return [
            new Plugin<HeadingCollapseState>({
                key: headingCollapsePluginKey,
                state: {
                    init: (_, state) => createState(state.doc, new Set<string>()),
                    apply: (tr, previousState, _, newState) => {
                        const nextCollapsedIds = new Set(previousState.collapsedHeadingIds);
                        const toggleMeta = tr.getMeta(headingCollapsePluginKey) as
                            | ToggleCollapseMeta
                            | undefined;

                        if (toggleMeta?.blockId) {
                            if (nextCollapsedIds.has(toggleMeta.blockId)) {
                                nextCollapsedIds.delete(toggleMeta.blockId);
                            } else {
                                nextCollapsedIds.add(toggleMeta.blockId);
                            }
                        }

                        if (!tr.docChanged && !toggleMeta) {
                            return previousState;
                        }

                        return createState(newState.doc, nextCollapsedIds);
                    },
                },
                props: {
                    decorations(state) {
                        return headingCollapsePluginKey.getState(state)?.decorations ?? null;
                    },
                    handleDOMEvents: {
                        mousedown: (view, event) => {
                            const target = event.target;
                            if (!(target instanceof Element)) {
                                return false;
                            }

                            const toggleButton = target.closest('[data-bt-heading-collapse-toggle="true"]');
                            if (!(toggleButton instanceof HTMLElement)) {
                                return false;
                            }

                            const blockId = toggleButton.getAttribute('data-block-id');
                            if (!blockId) {
                                return false;
                            }

                            event.preventDefault();
                            event.stopPropagation();

                            return toggleHeadingCollapse(view, blockId);
                        },
                    },
                },
            }),
        ];
    },
});
