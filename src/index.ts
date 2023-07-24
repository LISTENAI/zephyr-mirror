import { join } from 'path';
import simpleGit from 'simple-git';
import * as YAML from 'js-yaml';
import { remove, readFile, outputFile } from 'fs-extra';
import http, { HTTPError } from 'got';

import { Manifest } from './manifest';

const WORK_DIR = join(__dirname, '..', 'work');

const MANIFEST_BASE = 'https://github.com/zephyrproject-rtos';
const MANIFEST_REPO = `${MANIFEST_BASE}/zephyr`;

const MANIFEST_API = 'https://api.github.com';
const MANIFEST_GROUP = 'zephyrproject-rtos';

const LSC_TOKEN = process.env.LSC_TOKEN;
const LSC_BASE = `https://xychen:${LSC_TOKEN}@cloud.listenai.com/zephyr-mirror`;

const LSC_API = 'https://cloud.listenai.com/api/v4';
const LSC_GROUP = 'zephyr-mirror';
const LSC_NAMESPACE = '535';

const log = console.log;

const git = simpleGit().outputHandler((bin, stdout, stderr, args) => {
    console.log(`$ ${bin} ${args.join(' ')}`);
    stdout.pipe(process.stdout);
    stderr.pipe(process.stderr);
});

function logHttpError(e: unknown) {
    if (e instanceof HTTPError) {
        console.error(e.response.body);
    }
}

async function makeProjectAttributes(name: string): Promise<Record<string, string>> {
    const { default_branch } = await http.get(`${MANIFEST_API}/repos/${MANIFEST_GROUP}/${name}`)
        .json<{ default_branch: string }>();

    return {
        default_branch,
        builds_access_level: 'disabled',
        issues_access_level: 'disabled',
        merge_requests_access_level: 'disabled',
        wiki_access_level: 'disabled',
        visibility: 'public',
    };
}

async function ensureProjectAttributes(name: string, attributes: Record<string, string>): Promise<void> {
    try {
        await http.put(`${LSC_API}/projects/${encodeURIComponent(`${LSC_GROUP}/${name}`)}`, {
            headers: { 'PRIVATE-TOKEN': LSC_TOKEN },
            json: {
                ...attributes,
            },
        });
    } catch (e) {
        logHttpError(e);
        throw e;
    }
}

async function ensureProjectExists(name: string, attributes: Record<string, string>): Promise<void> {
    try {
        await http.post(`${LSC_API}/projects`, {
            headers: { 'PRIVATE-TOKEN': LSC_TOKEN },
            json: {
                path: name,
                namespace_id: LSC_NAMESPACE,
                ...attributes,
            },
        });
    } catch (e) {
        // No rethrow
    }
}

async function clearProtectedBranches(name: string): Promise<void> {
    try {
        const project = encodeURIComponent(`${LSC_GROUP}/${name}`);
        const branches = await http.get(`${LSC_API}/projects/${project}/protected_branches`, {
            headers: { 'PRIVATE-TOKEN': LSC_TOKEN },
        }).json<{ id: number, name: string }[]>();
        for (const { name } of branches) {
            console.log(`* Clearing protected branch ${name}…`);
            await http.delete(`${LSC_API}/projects/${project}/protected_branches/${encodeURIComponent(name)}`, {
                headers: { 'PRIVATE-TOKEN': LSC_TOKEN },
            });
        }
    } catch (e) {
        logHttpError(e);
    }
}

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

    manifest.projects.push({
        name: 'zephyr',
        revision,
        ...manifest.self!,
    });

    const projects = manifest.projects
        .filter(({ remote }) => typeof remote == 'undefined');

    log('# Update repositories');
    for (let i = 0; i < projects.length; i++) {
        const proj = projects[i];
        log(`# [${i + 1}/${projects.length}] ${proj.name}`);
        const name = (proj['repo-path'] || proj.name).replace(/\.git$/, '');
        const attrs = await makeProjectAttributes(name);
        await ensureProjectExists(name, attrs);
        await clearProtectedBranches(name);
        await git.clone(`${MANIFEST_BASE}/${name}`, join(WORK_DIR, name), ['--bare']);
        await git.cwd(join(WORK_DIR, name));
        await git.push(['--mirror', `${LSC_BASE}/${name}.git`]);
        await ensureProjectAttributes(name, attrs);
        await clearProtectedBranches(name);
    }
    log('');

    log('# Update mirror manifest');
    await git.clone(`${LSC_BASE}/manifest.git`, join(WORK_DIR, 'manifest-mirror'), ['--depth', '2']);
    await git.cwd(join(WORK_DIR, 'manifest-mirror'));
    await git.addConfig('user.name', 'xychen');
    await git.addConfig('user.email', 'xychen@listenai.com');
    manifest.remotes[0]['url-base'] = 'https://cloud.listenai.com/zephyr-mirror';
    delete manifest.self;
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
