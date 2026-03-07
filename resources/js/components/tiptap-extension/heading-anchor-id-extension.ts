import { Extension } from '@tiptap/core';

export const HeadingAnchorIdExtension = Extension.create({
    name: 'headingAnchorId',

    addGlobalAttributes() {
        return [
            {
                types: ['heading'],
                attributes: {
                    id: {
                        default: null,
                        parseHTML: (element: HTMLElement) =>
                            element.getAttribute('id') ??
                            element.getAttribute('data-id'),
                        renderHTML: (attributes: { id?: string | null }) => {
                            const value = attributes.id?.trim();
                            if (!value) {
                                return {};
                            }

                            return {
                                id: value,
                                'data-id': value,
                            };
                        },
                    },
                },
            },
        ];
    },
});
