import test from 'node:test';
import assert from 'node:assert/strict';
import { RenderStats } from '../src/renderer/RenderStats.js';

test('render statistics count indexed, non-indexed, and instanced GPU submissions and restore methods', () => {
    const calls=[];
    const gl={TRIANGLES:4,LINES:1};
    for (const name of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']) gl[name]=function(...args){calls.push({name,args,receiver:this});};
    const original=gl.drawElements;
    const stats=new RenderStats(gl);
    stats.beginFrame();
    gl.drawElements(gl.TRIANGLES,12,0,0);
    gl.drawArrays(gl.TRIANGLES,0,6);
    gl.drawElementsInstanced(gl.TRIANGLES,9,0,0,5);
    gl.drawArraysInstanced(gl.TRIANGLES,0,3,10);
    gl.drawArrays(gl.LINES,0,8);
    assert.equal(stats.drawCalls,5);
    assert.equal(stats.triangles,31);
    assert.ok(calls.every(call=>call.receiver===gl));
    stats.beginFrame();
    assert.equal(stats.drawCalls,0);
    assert.equal(stats.triangles,0);
    stats.delete();
    assert.equal(gl.drawElements,original);
});
