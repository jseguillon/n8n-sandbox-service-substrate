const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { runInNewContext } = require('node:vm');

const template = readFileSync(join(__dirname, 'actor-template.yaml.tmpl'), 'utf8');
const shell = template.match(/  - \|\n([\s\S]*?)\n  env:/)[1].replace(/^    /gm, '');
const bootstrap = shell.match(/node -e '([\s\S]*?)'\n/)[1];
const manifest = template.match(/  - name: N8N_RUNTIME_PACKAGE_JSON\n    value: '([^']+)'/)[1];
const marker = '.n8n-runtime-ready';
const revision = createHash('sha256').update(manifest).digest('hex');

function fixture({ failInstall = false, failValidation = false } = {}) {
	const files = new Map();
	const calls = [];
	const modules = {
		'node:fs': {
			existsSync: (path) => files.has(path),
			readFileSync: (path) => files.get(path),
			writeFileSync: (path, content) => files.set(path, content),
			renameSync: (from, to) => {
				files.set(to, files.get(from));
				files.delete(from);
			},
		},
		'node:crypto': { createHash },
		'node:child_process': {
			execFileSync: (command, args) => {
				calls.push({ command, args: Array.from(args) });
				if ((args[0] === 'install' && failInstall) || (args[0] === 'ls' && failValidation)) {
					throw new Error('Dependency preparation failed');
				}
			},
		},
	};
	return {
		files,
		calls,
		run: () => runInNewContext(bootstrap, {
			require: (name) => modules[name],
			process: { env: { N8N_RUNTIME_PACKAGE_JSON: manifest } },
		}),
	};
}

test('the template starts the daemon only after bootstrap completes', () => {
	assert.equal(spawnSync('/bin/sh', ['-n'], { input: shell }).status, 0);
	assert.ok(shell.trim().endsWith('exec /usr/local/bin/sandbox-daemon --listen-addr :80'));
	assert.match(template, /wakeupProbe:\n    httpGet:\n      path: \/healthz/);
	assert.match(template, /goldenSnapshotConfig:\n    mode: GOLDEN_SNAPSHOT_MODE_ENABLED/);
});

test('bootstrap installs and validates dependencies before it publishes readiness', () => {
	const state = fixture();
	state.run();
	assert.deepEqual(JSON.parse(state.files.get('package.json')), JSON.parse(manifest));
	assert.deepEqual(state.calls, [
		{ command: 'npm', args: ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-online'] },
		{ command: 'npm', args: ['ls', '--all', '--silent'] },
	]);
	assert.equal(state.files.get(marker).trim(), revision);
	assert.equal(state.files.has(marker + '.tmp'), false);
});

test('repeated bootstrap preserves user files and does not install again', () => {
	const state = fixture();
	state.run();
	state.files.set('package.json', 'user-modified manifest');
	state.files.set('src/workflow.ts', 'user workflow');
	state.run();
	assert.equal(state.calls.length, 2);
	assert.equal(state.files.get('package.json'), 'user-modified manifest');
	assert.equal(state.files.get('src/workflow.ts'), 'user workflow');
});

for (const failure of ['failInstall', 'failValidation']) {
	test(`${failure} prevents readiness publication`, () => {
		const state = fixture({ [failure]: true });
		assert.throws(state.run, /Dependency preparation failed/);
		assert.equal(state.files.has(marker), false);
	});
}
