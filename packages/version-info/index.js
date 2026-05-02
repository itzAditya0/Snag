import { existsSync }  from 'node:fs';
import { join, parse } from 'node:path';
import { cwd }         from 'node:process';
import { readFile }    from 'node:fs/promises';

// version-info reads git metadata at runtime to populate GET / for
// observability. originally cobalt did this by reading .git/HEAD etc.
// at runtime, which forced docker images to copy the entire .git/
// directory into the runtime stage — leaking branch history and
// inflating the image. snag adds two explicit overrides so production
// images can bake metadata at build time and ship a clean runtime:
//
//   1. SNAG_COMMIT / SNAG_BRANCH / SNAG_REMOTE env vars (highest
//      priority; useful for CI/CD systems setting build args).
//   2. /etc/snag/version.json (or wherever SNAG_VERSION_FILE points)
//      with { commit, branch, remote, version } keys.
//   3. fallback to .git/* file reads if neither override is set.
//
// the two cloudflare env vars stay supported for parity.

const findFile = (file) => {
    let dir = cwd();

    while (dir !== parse(dir).root) {
        if (existsSync(join(dir, file))) {
            return dir;
        }

        dir = join(dir, '../');
    }
}

const root = findFile('.git');
const pack = findFile('package.json');

const readGit = (filename) => {
    if (!root) {
        throw 'no git repository root found';
    }

    return readFile(join(root, filename), 'utf8');
}

// load the bake-at-build-time version file lazily, once. SNAG_VERSION_FILE
// can override the default location for non-docker deploys.
let _bakedCache;
const readBakedVersion = async () => {
    if (_bakedCache !== undefined) return _bakedCache;
    const path = process.env.SNAG_VERSION_FILE || '/etc/snag/version.json';
    try {
        const raw = await readFile(path, 'utf8');
        _bakedCache = JSON.parse(raw);
    } catch {
        _bakedCache = null;
    }
    return _bakedCache;
}

export const getCommit = async () => {
    if (process.env.SNAG_COMMIT) return process.env.SNAG_COMMIT;
    const baked = await readBakedVersion();
    if (baked?.commit) return baked.commit;

    return (await readGit('.git/logs/HEAD'))
            ?.split('\n')
            ?.filter(String)
            ?.pop()
            ?.split(' ')[1];
}

export const getBranch = async () => {
    if (process.env.SNAG_BRANCH) return process.env.SNAG_BRANCH;
    if (process.env.CF_PAGES_BRANCH) return process.env.CF_PAGES_BRANCH;
    if (process.env.WORKERS_CI_BRANCH) return process.env.WORKERS_CI_BRANCH;

    const baked = await readBakedVersion();
    if (baked?.branch) return baked.branch;

    return (await readGit('.git/HEAD'))
            ?.replace(/^ref: refs\/heads\//, '')
            ?.trim();
}

export const getRemote = async () => {
    if (process.env.SNAG_REMOTE) return process.env.SNAG_REMOTE;
    const baked = await readBakedVersion();
    if (baked?.remote) return baked.remote;

    let remote = (await readGit('.git/config'))
                    ?.split('\n')
                    ?.find(line => line.includes('url = '))
                    ?.split('url = ')[1];

    if (remote?.startsWith('git@')) {
        remote = remote.split(':')[1];
    } else if (remote?.startsWith('http')) {
        remote = new URL(remote).pathname.substring(1);
    }

    remote = remote?.replace(/\.git$/, '');

    if (!remote) {
        throw 'could not parse remote';
    }

    return remote;
}

export const getVersion = async () => {
    if (process.env.SNAG_VERSION) return process.env.SNAG_VERSION;
    const baked = await readBakedVersion();
    if (baked?.version) return baked.version;

    if (!pack) {
        throw 'no package root found';
    }

    const { version } = JSON.parse(
        await readFile(join(pack, 'package.json'), 'utf8')
    );

    return version;
}
