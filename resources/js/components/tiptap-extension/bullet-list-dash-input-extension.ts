import { wrappingInputRule } from '@tiptap/core';
import { BulletList } from '@tiptap/extension-list';

const DASH_BULLET_INPUT_REGEX = /^\s*(-)\s$/;

export const BulletListDashInputExtension = BulletList.extend({
    addInputRules() {
        const inputRule = wrappingInputRule({
            find: DASH_BULLET_INPUT_REGEX,
            type: this.type,
        });

        return [inputRule];
    },
});
