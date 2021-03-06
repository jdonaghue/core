import registerSuite = require('intern!object');
import assert = require('intern/chai!assert');
import sinon = require('sinon');
import * as aspect from 'src/aspect';
import { Handle } from 'src/interfaces';

const slice = Array.prototype.slice;
let obj: any;
let methodSpy: any;

function createBeforeSpy() {
	return sinon.spy(function (a: number) {
		return [a + 1];
	});
}

registerSuite({
		name: 'aspect',

		'beforeEach'() {
			methodSpy = sinon.spy(function (a: number) {
				return a + 1;
			});
			obj = { method: methodSpy };
		},

		'.before': {
			'return value passed as arguments'() {
				let aspectSpy = createBeforeSpy();

				aspect.before(obj, 'method', aspectSpy);

				obj.method(0);
				assert.isTrue(aspectSpy.calledBefore(methodSpy));
				assert.isTrue(aspectSpy.calledOnce);
				assert.isTrue(methodSpy.calledOnce);
				assert.strictEqual(aspectSpy.lastCall.args[0], 0);
				assert.strictEqual(methodSpy.lastCall.args[0], 1);
				assert.strictEqual(methodSpy.returnValues[0], 2);
			},

			'no return value from advising function'() {
				let receivedArgs: string[];
				let beforeCalled = false;
				let obj = {
					method: function (...args: string[]) {
						receivedArgs = args;
					}
				};

				aspect.before(obj, 'method', function () {
					beforeCalled = true;
				});

				obj.method('foo', 'bar');

				assert.isTrue(beforeCalled,
					'Before advice should be called before original function');
				assert.deepEqual(receivedArgs, [ 'foo', 'bar' ],
					'Arguments passed to original method should be unaltered if before advice returns undefined');
			},

			'multiple aspect.before()'() {
				const aspectSpy1 = createBeforeSpy();
				const aspectSpy2 = createBeforeSpy();

				aspect.before(obj, 'method', aspectSpy1);
				aspect.before(obj, 'method', aspectSpy2);

				obj.method(5);
				assert.isTrue(aspectSpy2.calledBefore(aspectSpy1));
				assert.isTrue(aspectSpy1.calledBefore(methodSpy));
				assert.strictEqual(aspectSpy2.lastCall.args[0], 5);
				assert.strictEqual(aspectSpy1.lastCall.args[0], 6);
				assert.strictEqual(methodSpy.lastCall.args[0], 7);
				assert.strictEqual(methodSpy.returnValues[0], 8);
			},

			'multiple aspect.before() with removal inside handler'() {
				let count = 0;

				const handle1 = aspect.before(obj, 'method', function () {
					count++;
				});

				const handle2 = aspect.before(obj, 'method', function () {
					handle2.destroy();
					handle1.destroy();
					count++;
				});

				assert.doesNotThrow(function () {
					obj.method();
				});
				assert.strictEqual(count, 1, 'Only one advising function should be called');
			}
		},

		'.after': {
			'overriding return value from original method'() {
				const expected = 'override!';
				const aspectSpy = sinon.stub().returns(expected);

				aspect.after(obj, 'method', aspectSpy);
				assert.strictEqual(obj.method(0), expected);
				assert.isTrue(aspectSpy.calledAfter(methodSpy));
			},

			'multiple aspect.after()'() {
				const aspectStub1 = sinon.stub();
				const aspectStub2 = sinon.stub();

				aspect.after(obj, 'method', aspectStub1);
				aspect.after(obj, 'method', aspectStub2);

				obj.method(0);
				assert.isTrue(aspectStub1.calledAfter(methodSpy));
				assert.isTrue(aspectStub2.calledAfter(aspectStub1));
			},

			'multiple aspect.after() with removal inside handler'() {
				let count = 0;

				let handle2: Handle;
				const handle1 = aspect.after(obj, 'method', function () {
					handle1.destroy();
					handle2.destroy();
					count++;
				});

				handle2 = aspect.after(obj, 'method', function () {
					count++;
				});

				assert.doesNotThrow(function () {
					obj.method();
				});
				assert.strictEqual(count, 1, 'Only one advising function should be called');
			},

			'provides the original arguments to the aspect method'() {
				const expected = 'expected';
				const aspectStub = sinon.stub().returns(expected);

				aspect.after(obj, 'method', aspectStub);
				assert.strictEqual(obj.method(0), expected);
				assert.isTrue(aspectStub.calledAfter(methodSpy));
				assert.strictEqual(aspectStub.lastCall.args[0], 1);
				assert.deepEqual(slice.call(aspectStub.lastCall.args[1]), methodSpy.lastCall.args);
			}
		},

		'.around': {
			'single around'() {
				const expected = 5;
				const aroundFunction = sinon.stub().returns(expected);
				const aspectStub = sinon.stub().returns(aroundFunction);

				aspect.around(obj, 'method', aspectStub);

				assert.strictEqual(obj.method(0), expected);
				assert.isTrue(aspectStub.calledOnce);
				assert.isTrue(aroundFunction.calledOnce);
				assert.strictEqual(aroundFunction.firstCall.args[0], 0);
				assert.isFalse(methodSpy.called);

				// test that the original method was provided
				aspectStub.callArgWith(0, 10);
				assert.isTrue(methodSpy.calledOnce);
				assert.strictEqual(methodSpy.firstCall.args[0], 10);
			}
		},

		'handle.destroy()': {
			'prevents aspect from being called'() {
				const aspectSpy = createBeforeSpy();
				const handle = aspect.before(obj, 'method', aspectSpy);

				obj.method(0);
				assert.notEqual(obj.method, methodSpy);

				handle.destroy();
				obj.method(1);
				assert.notEqual(obj.method, methodSpy);
				assert.isTrue(methodSpy.calledTwice);
				assert.isTrue(aspectSpy.calledOnce);
			},

			'can remove an aspect from the middle of a list'() {
				const aspectSpy1 = createBeforeSpy();
				const aspectSpy2 = createBeforeSpy();
				const handle = aspect.before(obj, 'method', aspectSpy1);

				aspect.before(obj, 'method', aspectSpy2);
				handle.destroy();

				obj.method(0);
				assert.isTrue(methodSpy.called);
				assert.isTrue(aspectSpy2.called);
				assert.isFalse(aspectSpy1.called);
			},

			'removing a aspect stub'() {
				const obj: any = {};
				const aspectSpy = sinon.stub();
				aspect.before(obj, 'method', sinon.stub());
				const handle = aspect.before(obj, 'method', aspectSpy);

				handle.destroy();
				obj.method(0);
				assert.isFalse(aspectSpy.called);
			},

			'removing the first of multiple aspects'() {
				const aroundFunction = sinon.stub();
				const aspectStub = sinon.stub().returns(aroundFunction);
				const handle = aspect.around(obj, 'method', aspectStub);

				handle.destroy();
				obj.method(0);
				assert.isTrue(aspectStub.calledOnce);
				assert.isTrue(methodSpy.calledOnce);
				assert.isFalse(aroundFunction.called);
			}
		}
	}
);
