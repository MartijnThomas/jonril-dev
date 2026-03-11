import { Extension, wrappingInputRule } from '@tiptap/core';

const CHECKLIST_PLUS_INPUT_REGEX = /^\s*(\+)\s$/;

export const CheckListPlusInputExtension = Extension.create({
    name: 'checkListPlusInput',

    addInputRules() {
        const checkListType = this.editor.schema.nodes.checkList;
        if (!checkListType) {
            return [];
        }

        return [
            wrappingInputRule({
                find: CHECKLIST_PLUS_INPUT_REGEX,
                type: checkListType,
            }),
        ];
    },
});
