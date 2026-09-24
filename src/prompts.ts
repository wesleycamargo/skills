import * as clack from '@clack/prompts';
import { cancelSymbol, searchMultiselect, SearchMultiselectOptions } from './vendor/skills/search-multiselect.js';

/** Returned by any prompt that the user cancelled (Escape, Ctrl+C, or end of input). */
export const CANCEL = Symbol('skills-sync.cancel');
export type Cancel = typeof CANCEL;

export interface Option<T> { value: T; label: string; hint?: string }
export interface Spinner { start(message: string): void; stop(message: string): void; error(message: string): void }

/** The prompt surface used by the wizard and the apply confirmation; tests supply scripted answers. */
export interface Prompts {
  intro(title: string): void;
  outro(message: string): void;
  cancel(message: string): void;
  note(message: string, title: string): void;
  log: { info(message: string): void; warn(message: string): void; error(message: string): void };
  spinner(): Spinner;
  text(options: { message: string; initialValue?: string; validate?: (value: string) => string | undefined }): Promise<string | Cancel>;
  select<T>(options: { message: string; options: Option<T>[]; initialValue?: T }): Promise<T | Cancel>;
  searchMultiselect<T>(options: SearchMultiselectOptions<T>): Promise<T[] | Cancel>;
  confirm(options: { message: string; initialValue: boolean }): Promise<boolean | Cancel>;
}

export function toCancel<T>(value: T | symbol): T | Cancel {
  return clack.isCancel(value) || value === cancelSymbol ? CANCEL : value as T;
}

export const clackPrompts: Prompts = {
  intro: title => clack.intro(title),
  outro: message => clack.outro(message),
  cancel: message => clack.cancel(message),
  note: (message, title) => clack.note(message, title),
  log: { info: m => clack.log.info(m), warn: m => clack.log.warn(m), error: m => clack.log.error(m) },
  spinner: () => clack.spinner(),
  text: async ({ message, initialValue, validate }) => toCancel(await clack.text({
    message, initialValue, validate: validate && (value => validate(value ?? ''))
  })),
  // clack's Option type is conditional on the value type; our options always carry a label.
  select: async <T>(options: { message: string; options: Option<T>[]; initialValue?: T }) =>
    toCancel<T>(await clack.select<T>(options as Parameters<typeof clack.select<T>>[0])),
  searchMultiselect: async options => toCancel(await searchMultiselect(options)),
  confirm: async options => toCancel(await clack.confirm(options)),
};
