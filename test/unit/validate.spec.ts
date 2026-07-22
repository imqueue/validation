/*!
 * @validate / @validatable / @validated decorator unit tests
 *
 * I'm Queue Software Project
 * Copyright (C) 2025  imqueue.com <support@imqueue.com>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * If you want to use this code in a closed source (commercial) project, you can
 * purchase a proprietary commercial license. Please contact us at
 * <support@imqueue.com> to get commercial licensing options.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { schemaOf, validatable, validate, validated } from '../../index.js';

@validatable()
class Creds {
    @validate(z.string().min(3))
    identifier!: string;

    @validate(z.string().min(8))
    secret!: string;
}

@validatable()
class NoRules {
    plain!: string;
}

test('schemaOf assembles field schemas into an object schema', () => {
    const schema = schemaOf(Creds);
    assert.ok(schema);
    assert.doesNotThrow(() =>
        schema.parse({ identifier: 'abc', secret: '12345678' }),
    );
    assert.throws(() => schema.parse({ identifier: 'ab', secret: 'short' }));
});

test('schemaOf returns null for a class with no @validate fields', () => {
    assert.equal(schemaOf(NoRules), null);
});

test('@validated passes valid arguments through', () => {
    class Svc {
        @validated(Creds)
        run(creds: Creds): string {
            return `${creds.identifier}:ok`;
        }
    }
    assert.equal(
        new Svc().run({ identifier: 'abc', secret: '12345678' } as Creds),
        'abc:ok',
    );
});

test('@validated throws ZodError on invalid arguments', () => {
    class Svc {
        @validated(Creds)
        run(creds: Creds): string {
            return creds.identifier;
        }
    }
    assert.throws(
        () => new Svc().run({ identifier: 'x', secret: 'y' } as Creds),
        (err: unknown) => err instanceof z.ZodError,
    );
});

test('@validated accepts a bare Zod schema too', () => {
    class Svc {
        @validated(z.number().int().positive())
        run(n: number): number {
            return n;
        }
    }
    assert.equal(new Svc().run(5), 5);
    assert.throws(
        () => new Svc().run(-1),
        (e: unknown) => e instanceof z.ZodError,
    );
});

test('null/undefined validators skip that positional argument', () => {
    class Svc {
        @validated(null, z.string().min(2))
        run(_skipped: unknown, name: string): string {
            return name;
        }
    }
    // First arg is not validated (anything passes); second is.
    assert.equal(new Svc().run({ anything: true }, 'ok'), 'ok');
    assert.throws(
        () => new Svc().run({ anything: true }, 'x'),
        (e: unknown) => e instanceof z.ZodError,
    );
});
