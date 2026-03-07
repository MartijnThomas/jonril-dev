import { computePosition, flip, shift } from '@floating-ui/dom';
import { posToDOMRect, ReactRenderer } from '@tiptap/react';
import { TokenSuggestionList } from '@/components/tiptap-mention/token-suggestion-list';
import type { TokenSuggestionItem } from '@/components/tiptap-mention/token-suggestion-list';

type CreateWorkspaceTokenSuggestionOptions = {
    char: '@' | '#';
    heading: string;
    itemsRef: { current: string[] };
    persistItem: (value: string) => Promise<string[]>;
};

const normalizeToken = (value: string) => value.trim();
const isValidToken = (value: string) => {
    if (value === '' || /\s/u.test(value)) {
        return false;
    }

    return Array.from(value).every((char) => {
        if (char === '_' || char === '-') {
            return true;
        }

        if (/[0-9]/.test(char)) {
            return true;
        }

        // Works for latin + accented letters without unicode property escapes.
        return char.toLowerCase() !== char.toUpperCase();
    });
};

const updatePosition = (editor: any, element: HTMLElement) => {
    const virtualElement = {
        getBoundingClientRect: () =>
            posToDOMRect(
                editor.view,
                editor.state.selection.from,
                editor.state.selection.to,
            ),
    };

    computePosition(virtualElement, element, {
        placement: 'bottom-start',
        strategy: 'absolute',
        middleware: [shift(), flip()],
    }).then(({ x, y, strategy }) => {
        element.style.width = 'max-content';
        element.style.position = strategy;
        element.style.left = `${x}px`;
        element.style.top = `${y}px`;
    });
};

export function createWorkspaceTokenSuggestion({
    char,
    heading,
    itemsRef,
    persistItem,
}: CreateWorkspaceTokenSuggestionOptions) {
    return {
        items: ({ query }: { query: string }): TokenSuggestionItem[] => {
            const normalized = normalizeToken(query);
            const queryLower = normalized.toLowerCase();

            const existing = itemsRef.current
                .filter((item) => item.toLowerCase().startsWith(queryLower))
                .slice(0, 8)
                .map((item) => ({ id: item, label: item }));

            if (normalized === '' || !isValidToken(normalized)) {
                return existing;
            }

            const exactExists = itemsRef.current.some(
                (item) => item.toLowerCase() === normalized.toLowerCase(),
            );

            if (exactExists) {
                return existing;
            }

            return [
                ...existing,
                {
                    id: normalized,
                    label: normalized,
                    isCreate: true,
                },
            ];
        },

        command: async ({ editor, range, props }: any) => {
            let label = normalizeToken(
                (props?.label ?? props?.id ?? '') as string,
            );

            if (!label || !isValidToken(label)) {
                return;
            }

            const exactExisting = itemsRef.current.find(
                (item) => item.toLowerCase() === label.toLowerCase(),
            );

            if (props?.isCreate || !exactExisting) {
                const updatedItems = await persistItem(label);
                itemsRef.current = updatedItems;
                const canonical = updatedItems.find(
                    (item) => item.toLowerCase() === label.toLowerCase(),
                );
                if (canonical) {
                    label = canonical;
                }
            } else {
                label = exactExisting;
            }

            editor
                .chain()
                .focus()
                .insertContentAt(range, [
                    {
                        type: char === '@' ? 'mention' : 'hashtag',
                        attrs: {
                            id: label,
                            label,
                            mentionSuggestionChar: char,
                        },
                    },
                    { type: 'text', text: ' ' },
                ])
                .run();
        },

        render: () => {
            let component: ReactRenderer<any, any>;

            return {
                onStart: (props: any) => {
                    component = new ReactRenderer(TokenSuggestionList, {
                        props: {
                            ...props,
                            heading,
                            char,
                        },
                        editor: props.editor,
                    });

                    if (!props.clientRect) return;

                    component.element.style.position = 'absolute';
                    document.body.appendChild(component.element);
                    updatePosition(props.editor, component.element);
                },

                onUpdate: (props: any) => {
                    component.updateProps({
                        ...props,
                        heading,
                        char,
                    });

                    if (!props.clientRect) return;
                    updatePosition(props.editor, component.element);
                },

                onKeyDown: (props: any) => {
                    if (props.event.key === 'Escape') {
                        component.destroy();
                        return true;
                    }

                    return component.ref?.onKeyDown(props) ?? false;
                },

                onExit: () => {
                    component.element.remove();
                    component.destroy();
                },
            };
        },
    };
}
