import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const mainPath = path.resolve(dirname, '../../src/main.ts');

function expectOrdered(source: string, snippets: readonly string[]): void {
    let previous = -1;
    for (const snippet of snippets) {
        const index = source.indexOf(snippet);
        expect(index, `Missing main lifecycle hook: ${snippet}`).toBeGreaterThan(previous);
        previous = index;
    }
}

describe('TPS Notebook Navigator API lifecycle main integration', () => {
    it('starts before asynchronous settings bootstrap and publishes only after startup registration', async () => {
        const main = await readFile(mainPath, 'utf8');
        const onload = main.slice(main.indexOf('async onload()'), main.indexOf('onUserEnable(): void'));
        const completeStartup = main.slice(
            main.indexOf('private async completeStartup'),
            main.indexOf('public registerSettingsUpdateListener')
        );

        expectOrdered(onload, ['this.apiLifecycle.start();', 'this.settingsController.loadSettingsAtStartup']);
        expectOrdered(completeStartup, [
            'this.api = new NotebookNavigatorAPI',
            'this.registerView(NOTEBOOK_NAVIGATOR_VIEW',
            'registerNavigatorCommands(this);',
            'registerWorkspaceEvents(this);',
            'this.hasStartedWithSettings = true;',
            'this.apiLifecycle?.publishAvailable(this.api);'
        ]);
    });

    it('publishes unavailable before provider registries are disposed and the API is cleared', async () => {
        const main = await readFile(mainPath, 'utf8');
        const unload = main.slice(main.indexOf('onunload()'), main.indexOf('async saveSettingsAndUpdate'));

        expectOrdered(unload, [
            'this.initiateShutdown();',
            'this.apiLifecycle?.stop();',
            'this.api?.[INTERNAL_NOTEBOOK_NAVIGATOR_API].types.dispose();',
            'this.api?.[INTERNAL_NOTEBOOK_NAVIGATOR_API].rows.dispose();',
            'this.api = null;'
        ]);
    });
});
