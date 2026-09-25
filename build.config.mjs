import { defineBuildConfig } from 'obuild/config';

// Bundle the CLI into dist/cli.js. Runtime `dependencies` (skills) and Node.js
// built-ins stay external; devDependencies such as enquirer are inlined.
export default defineBuildConfig({
  entries: [{ type: 'bundle', input: ['./src/cli.ts'], dts: false }],
  hooks: {
    rolldownOutput(output) {
      output.entryFileNames = '[name].js';
      output.chunkFileNames = '_chunks/[name].js';
    },
  },
});
