import { join } from 'path';
import simpleGit from 'simple-git';
import * as YAML from 'js-yaml';
import { remove, readFile, outputFile } from 'fs-extra';

import { Manifest } from './manifest';

const WORK_DIR = join(__dirname, '..', 'work');

const MANIFEST_REPO = 'https://github.com/zephyrproject-rtos/zephyr';

const LSC_TOKEN = process.env.LSC_TOKEN;
const LSC_BASE = `https://xychen:${LSC_TOKEN}@cloud.listenai.com/zephyr-mirror`;

const log = console.log;

const git = simpleGit().outputHandler((bin, stdout, stderr, args) => {
    console.log(`$ ${bin} ${args.join(' ')}`);
    stdout.pipe(process.stdout);
    stderr.pipe(process.stderr);
});

(async () => {

    log('# Hello world!');
    await remove(join(WORK_DIR));
    log('');

    log('# Fetch manifest');
    await git.clone(MANIFEST_REPO, join(WORK_DIR, 'manifest'), ['--depth', '1']);
    await git.cwd(join(WORK_DIR, 'manifest'));
    const revision = await git.revparse('HEAD');
    const manifestText = await readFile(join(WORK_DIR, 'manifest', 'west.yml'), 'utf-8');
    const { manifest } = YAML.load(manifestText) as Manifest;
    log('');

    log('# Update mirror manifest');
    await git.clone(`${LSC_BASE}/manifest.git`, join(WORK_DIR, 'manifest-mirror'), ['--depth', '2']);
    await git.cwd(join(WORK_DIR, 'manifest-mirror'));
    await git.addConfig('user.name', 'xychen');
    await git.addConfig('user.email', 'xychen@listenai.com');
    manifest.remotes[0]['url-base'] = LSC_BASE;
    const manifestMirrorText =
        '# Mirrored west manifest for Zephyr.\n' +
        `# ${MANIFEST_REPO}/raw/${revision}/west.yml\n` +
        '\n' +
        YAML.dump({ manifest });
    await outputFile(join(WORK_DIR, 'manifest-mirror', 'west.yml'), manifestMirrorText);
    await git.add(['.']);
    await git.commit(`Update manifest from revision ${revision}`);
    await git.push(['origin', 'master']);

})();
