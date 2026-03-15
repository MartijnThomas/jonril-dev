import { Node } from '@tiptap/core';

export const BlockTreeDocument = Node.create({
    name: 'doc',
    topNode: true,
    content: '(paragraph|heading|codeBlock|horizontalRule)+',
});
