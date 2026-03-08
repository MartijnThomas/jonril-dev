import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getWorkspaceIconComponent } from '@/components/icon-picker';
import { tokenToCssColor } from '@/lib/icon-style';

type NoteTitleIconMeta = {
    iconName: string | null;
    iconColor: string | null;
    iconBg: string | null;
};

const DEFAULT_ICON_CLASS = 'md-note-title-icon';
const DEFAULT_ICON_SVG_CLASS = 'md-note-title-icon-svg';

export const NOTE_TITLE_ICON_PLUGIN_KEY = new PluginKey<{
    iconName: string | null;
    iconColor: string | null;
    iconBg: string | null;
}>('noteTitleIcon');

export const NoteTitleIconExtension = Extension.create<{
    iconName: string | null;
    iconColor: string | null;
    iconBg: string | null;
}>({
    name: 'noteTitleIcon',

    addOptions() {
        return {
            iconName: null,
            iconColor: null,
            iconBg: null,
        };
    },

    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: NOTE_TITLE_ICON_PLUGIN_KEY,
                state: {
                    init: () => ({
                        iconName:
                            typeof this.options.iconName === 'string' &&
                            this.options.iconName.trim() !== ''
                                ? this.options.iconName.trim()
                                : null,
                        iconColor:
                            typeof this.options.iconColor === 'string' &&
                            this.options.iconColor.trim() !== ''
                                ? this.options.iconColor.trim()
                                : null,
                        iconBg:
                            typeof this.options.iconBg === 'string' &&
                            this.options.iconBg.trim() !== ''
                                ? this.options.iconBg.trim()
                                : null,
                    }),
                    apply: (tr, value) => {
                        const meta = tr.getMeta(
                            NOTE_TITLE_ICON_PLUGIN_KEY,
                        ) as NoteTitleIconMeta | undefined;
                        if (!meta) {
                            return value;
                        }

                        return {
                            ...value,
                            iconName:
                                typeof meta.iconName === 'string' &&
                                meta.iconName.trim() !== ''
                                    ? meta.iconName.trim()
                                    : null,
                            iconColor:
                                typeof meta.iconColor === 'string' &&
                                meta.iconColor.trim() !== ''
                                    ? meta.iconColor.trim()
                                    : null,
                            iconBg:
                                typeof meta.iconBg === 'string' &&
                                meta.iconBg.trim() !== ''
                                    ? meta.iconBg.trim()
                                    : null,
                        };
                    },
                },
                props: {
                    decorations: (state) => {
                        const pluginState =
                            NOTE_TITLE_ICON_PLUGIN_KEY.getState(state);
                        const iconName = pluginState?.iconName ?? null;
                        const iconColor = pluginState?.iconColor ?? null;
                        const iconBg = pluginState?.iconBg ?? null;

                        if (!iconName) {
                            return DecorationSet.empty;
                        }

                        let headingPos: number | null = null;

                        state.doc.descendants((node, pos) => {
                            if (
                                node.type.name === 'heading' &&
                                node.attrs.level === 1
                            ) {
                                headingPos = pos;
                                return false;
                            }

                            return true;
                        });

                        if (headingPos === null) {
                            return DecorationSet.empty;
                        }

                        const decoration = Decoration.widget(
                            headingPos + 1,
                            () => {
                                const IconComponent =
                                    getWorkspaceIconComponent(iconName);
                                const element = document.createElement('span');
                                element.className = DEFAULT_ICON_CLASS;
                                element.setAttribute('aria-hidden', 'true');

                                const cssColor = tokenToCssColor(
                                    iconColor,
                                    'text',
                                );
                                const cssBackground = tokenToCssColor(
                                    iconBg,
                                    'bg',
                                );

                                if (cssColor) {
                                    element.style.color = cssColor;
                                }
                                if (cssBackground) {
                                    element.style.backgroundColor =
                                        cssBackground;
                                }

                                element.innerHTML = renderToStaticMarkup(
                                    React.createElement(IconComponent, {
                                        className: DEFAULT_ICON_SVG_CLASS,
                                    }),
                                );

                                if (cssColor) {
                                    const svg = element.querySelector('svg');
                                    if (svg) {
                                        svg.style.color = cssColor;
                                        svg.style.stroke = cssColor;
                                    }
                                }

                                return element;
                            },
                            {
                                key: `note-title-icon:${iconName}:${iconColor ?? ''}:${iconBg ?? ''}:${headingPos}`,
                                side: -1,
                            },
                        );

                        return DecorationSet.create(state.doc, [decoration]);
                    },
                },
            }),
        ];
    },
});
