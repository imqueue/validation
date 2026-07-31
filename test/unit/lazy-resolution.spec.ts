/*!
 * @validated resolves its validators on first call, not at decoration
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

// Deferred resolution is not observable through ordinary decorator syntax: a
// class must exist before it can be named in a decorator argument, and
// `@validatable()` seals as part of defining it, so by the time the reference is
// legal the sealing has already happened. The only way to separate the two is to
// apply the class decorator by hand afterwards, which is what this file does.
//
// It lives in its own spec file on purpose. `Deferred` is left unsealed for part
// of module evaluation, and an unsealed class donates its buffered fields to the
// next class sealed in the same process — so sharing a file with other specs
// would corrupt them. `node --test` runs each file in its own process.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { validatable, validate, validated } from '../../index.js';

class Deferred {
    @validate(z.string().min(3))
    value!: string;
}

class Consumer {
    // Applied while `Deferred` is still unsealed. Were the validator resolved
    // here, it would resolve to null and this method would validate nothing.
    @validated(Deferred)
    run(v: Deferred): string {
        return v.value;
    }
}

// Sealed only now, after the decorator above has already run.
validatable()(Deferred, { kind: 'class' } as ClassDecoratorContext);

test('a validator sealed after decoration is still resolved on first call', () => {
    assert.equal(
        new Consumer().run({ value: 'long enough' } as Deferred),
        'long enough',
    );
    assert.throws(
        () => new Consumer().run({ value: 'no' } as Deferred),
        (e: unknown) => e instanceof z.ZodError,
        'resolution happened at call time, so the late seal took effect',
    );
});
