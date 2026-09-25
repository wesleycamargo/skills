import Enquirer from 'enquirer';
import type { Readable, Writable } from 'node:stream';
import type { SearchMultiselectOptions } from './vendor/skills/search-multiselect.js';

export const CANCEL = Symbol('skills-sync.cancel');
export type Cancel = typeof CANCEL;
export interface Option<T> { value: T; label: string; hint?: string }
export interface Spinner { start(message: string): void; stop(message: string): void; error(message: string): void }
export interface Prompts {
  intro(title: string): void;
  outro(message: string): void;
  cancel(message: string): void;
  note(message: string, title: string): void;
  log: { info(message: string): void; warn(message: string): void; error(message: string): void };
  spinner(): Spinner;
  text(options: { message: string; defaultValue?: string; validate?: (value: string) => string | undefined }): Promise<string | Cancel>;
  select<T>(options: { message: string; options: Option<T>[]; initialValue?: T }): Promise<T | Cancel>;
  searchMultiselect<T>(options: SearchMultiselectOptions<T>): Promise<T[] | Cancel>;
  confirm(options: { message: string; initialValue: boolean }): Promise<boolean | Cancel>;
}

export function createEnquirerPrompts(streams: { input?: Readable; output?: Writable } = {}): Prompts {
  const ask = async <T>(question: Record<string, unknown>): Promise<T | Cancel> => {
    try {
      const result = await Enquirer.prompt({ name: 'answer', stdin: streams.input, stdout: streams.output, ...question });
      return result.answer as T;
    } catch (error) {
      if (error === '' || error === undefined || (error instanceof Error && (error.name === 'ERR_USE_AFTER_CLOSE' || /cancel|abort/i.test(error.message)))) return CANCEL;
      throw error;
    }
  };
  return {
    intro: title => console.log(`\n${title}\n`),
    outro: message => console.log(message),
    cancel: message => console.log(message),
    note: (message, title) => console.log(`${title}\n${message}`),
    log: { info: console.log, warn: console.warn, error: console.error },
    spinner: () => ({ start: console.log, stop: console.log, error: console.error }),
    text: ({ message, defaultValue, validate }) => ask<string>({ type: 'input', message, initial: defaultValue,
      validate: (value: string) => validate?.(value || defaultValue || '') ?? true }),
    select: <T>({ message, options, initialValue }: { message: string; options: Option<T>[]; initialValue?: T }) =>
      ask<T>({ type: 'select', message, choices: options.map(o => ({ name: String(o.value), message: o.label, hint: o.hint })),
        initial: Math.max(0, options.findIndex(o => o.value === initialValue)), result: (name: string) => options.find(o => String(o.value) === name)?.value }),
    searchMultiselect: <T>(options: SearchMultiselectOptions<T>) => {
      if (options.lockedSection) console.log(`${options.lockedSection.title}: ${options.lockedSection.items.map(i => i.label).join(', ')}${options.lockedSection.hiddenCount ? ` (+${options.lockedSection.hiddenCount} more)` : ''}`);
      return ask<T[]>({ type: 'autocomplete', multiple: true, message: options.message,
        choices: options.items.map(i => ({ name: String(i.value), message: i.label, hint: i.hint,
          enabled: options.initialSelected?.includes(i.value) })),
        validate: (values: T[]) => !options.required || values.length > 0 || 'Select at least one agent',
        result: (values: string[]) => values.map(v => options.items.find(i => String(i.value) === v)!.value) });
    },
    confirm: ({ message, initialValue }) => ask<boolean>({ type: 'confirm', message, initial: initialValue }),
  };
}

export const clackPrompts = createEnquirerPrompts();
