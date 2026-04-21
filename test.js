const u = require('untab');
const mockFs = require('mock-fs');
const fs = require('fs');
const proxyquire = require('proxyquire');
const includes = require('array-includes');
const test = require('node:test');

const yankee = require('.');

const date = new Date('2016-05-20');
const path = '/my/project';

test('Detects the initial release', (t, done) => {
  mockFs({
    '/my/project/Changelog.yaml': u`
    master:
      note: Initial release
  `,
  });
  t.after(() => {
    mockFs.restore();
  });

  const result = yankee({ path, date });

  t.assert.strictEqual(fs.readFileSync('/my/project/Changelog.yaml', 'utf8'), u`
    1.0.0:
      date: 2016-05-20
      note: Initial release
  `);

  t.assert.deepStrictEqual(
    result,
    { previousVersion: undefined, newVersion: '1.0.0', bump: 'initial' },
    'reports correct bump data',
  );

  done();
});

test('Detects a breaking release', (t, done) => {
  mockFs({
    '/my/project/Changelog.yaml': u`
    master:
      breaking changes: Whatever

    1.2.3:
      date: 2016-05-19
      note: Whatever
  `,
  });
  t.after(() => {
    mockFs.restore();
  });

  const result = yankee({ path, date });

  t.assert.strictEqual(fs.readFileSync('/my/project/Changelog.yaml', 'utf8'), u`
    2.0.0:
      date: 2016-05-20
      breaking changes: Whatever

    1.2.3:
      date: 2016-05-19
      note: Whatever
  `);

  t.assert.deepStrictEqual(
    result,
    { previousVersion: '1.2.3', newVersion: '2.0.0', bump: 'breaking' },
    'reports correct bump data',
  );

  done();
});

test('Detects a feature release', (t, done) => {
  mockFs({
    '/my/project/Changelog.yaml': u`
    master:
      new features: Whatever

    1.2.3:
      date: 2016-05-19
      note: Whatever
  `,
  });
  t.after(() => {
    mockFs.restore();
  });

  const result = yankee({ path, date });

  t.assert.strictEqual(fs.readFileSync('/my/project/Changelog.yaml', 'utf8'), u`
    1.3.0:
      date: 2016-05-20
      new features: Whatever

    1.2.3:
      date: 2016-05-19
      note: Whatever
  `);

  t.assert.deepStrictEqual(
    result,
    { previousVersion: '1.2.3', newVersion: '1.3.0', bump: 'feature' },
    'reports correct bump data',
  );

  done();
});

test('Detects a bugfix release', (t, done) => {
  mockFs({
    '/my/project/Changelog.yaml': u`
    master:
      fixed bugs: Whatever

    1.2.3:
      date: 2016-05-19
      note: Whatever
  `,
  });
  t.after(() => {
    mockFs.restore();
  });

  const result = yankee({ path, date });

  t.assert.strictEqual(fs.readFileSync('/my/project/Changelog.yaml', 'utf8'), u`
    1.2.4:
      date: 2016-05-20
      fixed bugs: Whatever

    1.2.3:
      date: 2016-05-19
      note: Whatever
  `);

  t.assert.deepStrictEqual(
    result,
    { previousVersion: '1.2.3', newVersion: '1.2.4', bump: 'bugfix' },
    'reports correct bump data',
  );

  done();
});

test('Fails when the `Changelog.yaml` is not an object', (t, done) => {
  t.plan(1);

  mockFs({ '/my/project/Changelog.yaml': 'Just a string' });
  t.after(() => {
    mockFs.restore();
  });

  try {
    yankee({ path, date });
  } catch (error) {
    t.assert.ok(/a yaml object/i.test(error),
      'fails with a helpful message');
  }

  done();
});

test('Fails when the `Changelog.yaml` doesn’t contain `master:`', (t, done) => {
  t.plan(1);

  mockFs({
    '/my/project/Changelog.yaml': u`
    any old: object
  `,
  });
  t.after(() => {
    mockFs.restore();
  });

  try {
    yankee({ path, date });
  } catch (error) {
    t.assert.ok(/a top-level `unreleased:` property/i.test(error),
      'fails with a helpful message');
  }

  done();
});

const testInitialRelease = (title, callback) => {
  test(title, (t, done) => {
    const mockFsProxy = (options) => {
      mockFs({
        '/my/project/Changelog.yaml': u`
          master:
            note: Initial release
        `,
        ...options,
      });
      t.after(() => {
        mockFs.restore();
      });
    };

    const yankeeProxy = (options) => yankee(
      {
        path,
        date,
        ...options,
      },
    );

    callback(mockFsProxy, yankeeProxy, t, done);
  });
};

testInitialRelease('`npm` works', (mockFsProxy, yankeeProxy, t, done) => {
  mockFsProxy({
    '/my/project/package.json': '{ "version": "0.0.0" }',
    '/my/project/npm-shrinkwrap.json': '{}',
  });

  yankeeProxy({ npm: true });

  t.assert.strictEqual(
    fs.readFileSync('/my/project/package.json', 'utf8'),
    u`
      {
        "version": "1.0.0"
      }
    `,
    'updates the `version` in the `package.json`',
  );

  t.assert.strictEqual(
    fs.readFileSync('/my/project/npm-shrinkwrap.json', 'utf8'),
    u`
      {
        "version": "1.0.0"
      }
    `,
    'adds a `version` to the `npm-shrinkwrap.json`',
  );

  done();
});

testInitialRelease((
  'File update fails silently if file doesn’t exist'
), (mockFsProxy, yankeeProxy, t, done) => {
  mockFsProxy({});

  try {
    yankeeProxy({ npm: true });
  } catch (err) {
    /* istanbul ignore next */
    t.assert.fail(`an unexpected error was thrown: ${err}`);
  }

  done();
});

testInitialRelease((
  'File update fails gracefully if file is not valid JSON'
), (mockFsProxy, yankeeProxy, t, done) => {
  t.plan(1);

  mockFsProxy({
    '/my/project/package.json': 'invalid JSON',
  });

  try {
    yankeeProxy({ npm: true });
  } catch (error) {
    t.assert.ok(/valid json/i.test(error),
      'with a helpful message');
  }

  done();
});

testInitialRelease((
  'File update fails gracefully if file is not a JSON object'
), (mockFsProxy, yankeeProxy, t, done) => {
  t.plan(1);

  mockFsProxy({
    '/my/project/package.json': 'null',
  });

  try {
    yankeeProxy({ npm: true });
  } catch (error) {
    t.assert.ok(/a json object/i.test(error),
      'with a helpful message');
  }

  done();
});

testInitialRelease('`commit` works', (mockFsProxy, _, t, done) => {
  t.plan(4);

  const yankeeStub = proxyquire('.', {
    child_process: {
      spawnSync: (command, args, options) => {
        t.assert.deepStrictEqual(
          [command, args[0], options.cwd],
          ['git', 'commit', path],
          'calls `git commit`',
        );

        t.assert.strictEqual(
          args[1],
          '--message=1.0.0',
          'commit message equals raw version number',
        );

        t.assert.strictEqual(
          args[2],
          'Changelog.yaml',
          'ignores staged files and commits `Changelog.yaml`',
        );

        t.assert.ok(
          ([
            'package.json', 'npm-shrinkwrap.json',
          ].every((file) => includes(args, file))),
          'plays well with `npm`',
        );
      },
    },
  });

  mockFsProxy({
    '/my/project/package.json': '{}',
    '/my/project/npm-shrinkwrap.json': '{}',
  });

  yankeeStub({ npm: true, commit: true, path });

  done();
});

testInitialRelease((
  '`commit` doesn’t break when no `npm-shrinkwrap.json` is present'
), (mockFsProxy, _, t, done) => {
  t.plan(2);

  const yankeeStub = proxyquire('.', {
    child_process: {
      spawnSync: (command, args, options) => {
        t.assert.deepStrictEqual(
          [command, args[0], options.cwd],
          ['git', 'commit', path],
          'calls `git commit`',
        );

        t.assert.ok(
          !includes(args, 'npm-shrinkwrap.json'),
          'doesn’t try to commit non-existent files',
        );
      },
    },
  });

  mockFsProxy({
    '/my/project/package.json': '{}',
  });

  yankeeStub({ npm: true, commit: true, path });

  done();
});

testInitialRelease('`tag` works', (mockFsProxy, _, t, done) => {
  t.plan(4);

  let run = 0;
  const yankeeStub = proxyquire('.', {
    child_process: {
      spawnSync: (command, args, options) => {
        run++;

        if (run === 1) {
          t.assert.deepStrictEqual(
            [command, args[0]],
            ['git', 'commit'],
            'implies `commit`',
          );
        } else if (run === 2) {
          t.assert.deepStrictEqual(
            [command, args.slice(0, 2), options.cwd],
            ['git', ['tag', '--annotate'], path],
            'creates an annotated git tag',
          );

          t.assert.strictEqual(
            args[2],
            '--message=1.0.0',
            'commit message equals raw version number',
          );

          t.assert.strictEqual(
            args[3],
            'v1.0.0',
            'tag name equals raw version number preceeded with a “v”',
          );
        } else {
          /* istanbul ignore next */
          t.assert.fail('doesn’t run anything else');
        }
      },
    },
  });

  mockFsProxy({});

  yankeeStub({ npm: true, tag: true, path });

  done();
});
