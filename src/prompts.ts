import { input, select, checkbox, confirm } from '@inquirer/prompts';
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

export function createInquirerPrompts(streams: { input?: Readable; output?: Writable } = {}): Prompts {
  const context = { input: streams.input as NodeJS.ReadStream | undefined, output: streams.output as NodeJS.WriteStream | undefined };
  const safe = async <T>(operation: () => Promise<T>): Promise<T | Cancel> => {
    try { return await operation(); }
    catch (error) {
      if (error instanceof Error && (error.name === 'ExitPromptError' || error.name === 'AbortPromptError')) return CANCEL;
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
    text: ({ message, defaultValue, validate }) => safe(() => input({ message, default: defaultValue, validate: value => validate?.(value) ?? true }, context)),
    select: <T>({ message, options, initialValue }: { message: string; options: Option<T>[]; initialValue?: T }) => safe(() => select({ message,
      choices: options.map(o => ({ name: o.label, value: o.value, description: o.hint })), default: initialValue }, context)),
    searchMultiselect: <T>(options: SearchMultiselectOptions<T>) => {
      if (options.lockedSection) console.log(`${options.lockedSection.title}: ${options.lockedSection.items.map(i => i.label).join(', ')}${options.lockedSection.hiddenCount ? ` (+${options.lockedSection.hiddenCount} more)` : ''}`);
      return safe(() => checkbox({ message: options.message,
        choices: options.items.map(i => ({ name: i.label, value: i.value, description: i.hint, checked: options.initialSelected?.includes(i.value) })),
        required: options.required }, context));
    },
    confirm: ({ message, initialValue }) => safe(() => confirm({ message, default: initialValue }, context)),
  };
}

export const clackPrompts = createInquirerPrompts();
