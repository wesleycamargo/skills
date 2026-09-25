# Inquirer wizard prototype

This branch substitutes `@inquirer/prompts` for the existing Clack prompt adapter. The sync engine and saved configuration schema are unchanged.

Try the published prerelease in a disposable repository with `npx @wesleycamargo/skills-sync@<version> init`.

The agent selector uses Inquirer's checkbox prompt. It supports multiple selection and saved defaults, but this prototype does not provide live filtering for long agent lists. Universal agents are displayed as informational text above the choices.

`npm test` covers text defaults, cancellation, wizard configuration and sync integration. Compare with `feature/poc-enquirer` before choosing a prompt library.
