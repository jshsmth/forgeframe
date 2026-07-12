/**
 * Type definitions for ForgeFrame Playground
 */

export type RenderContext = 'iframe' | 'popup';
export type IframeStyle = 'embedded' | 'modal';

export interface ModalStyle {
  overlayBackground?: string;
  boxBackground?: string;
  borderRadius?: string;
  boxShadow?: string;
  width?: number;
  height?: number;
  headerBackground?: string;
  headerColor?: string;
  borderColor?: string;
}

export interface PlaygroundConfig {
  tag: string;
  url: string;
  dimensions?: {
    width?: string | number;
    height?: string | number;
  };
  style?: Record<string, string | number>;
  attributes?: Record<string, string | boolean>;
  timeout?: number;
  modalStyle?: ModalStyle;
  props?: {
    /** Prop definitions. Type can be: 'string', 'number', 'boolean', 'function', 'array', 'object' */
    name?: { type: string; required?: boolean; default?: string };
    count?: { type: string; default?: number };
    [key: string]: unknown;
  };
}

// Dynamic props - any user-defined props plus callbacks
export type DynamicProps = Record<string, unknown> & {
  onGreet: (message: string) => void;
  onClose: () => void;
  onError: (error: Error) => void;
};
