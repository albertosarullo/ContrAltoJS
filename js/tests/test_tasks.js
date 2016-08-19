/*
 JsAlto Xerox Alto Emulator
 Copyright (C) 2016  Seth J. Morabito

 This program is free software: you can redistribute it and/or modify
 it under the terms of the GNU Affero General Public License as published by
 the Free Software Foundation, either version 3 of the License, or
 (at your option) any later version.

 This program is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU Affero General Public License for more details.

 You should have received a copy of the GNU Affero General Public License
 along with this program.  If not, see
 <http://www.gnu.org/licenses/>.
*/

QUnit.module("Emulator Task Tests", {
    beforeEach: function() {
        Alu.reset();
        Cpu.reset();
        EmulatorTask.reset();
    }
});

QUnit.test("EmulatorTask Reset", function(assert) {
    assert.equal(EmulatorTask.rb, 0);
    assert.equal(EmulatorTask.srSelect, 0);
    assert.notOk(EmulatorTask.loadS);

    EmulatorTask.wakeup = false;
    EmulatorTask.reset();
    assert.ok(EmulatorTask.wakeup, "wakeup == true");
});

QUnit.test("EmulatorTask getBusSource", function(assert) {
    // Set up the CPU
    Cpu.s[1][5] = 0x5a;
    Cpu.m = 0xf0;

    EmulatorTask.rb = 1;
    EmulatorTask.srSelect = 5;

    assert.equal(EmulatorTask.getBusSource(EmulatorBusSource.READ_S_LOCATION), 0x5a);
    assert.notOk(EmulatorTask.loadS);

    // Load should return ffff and set loadS to true
    assert.ok(EmulatorTask.getBusSource(EmulatorBusSource.LOAD_S_LOCATION), 0xffff);
    assert.ok(EmulatorTask.loadS);

    EmulatorTask.srSelect = 0;
    assert.ok(EmulatorTask.getBusSource(EmulatorBusSource.READ_S_LOCATION), 0xf0);
});

QUnit.test("Unimplemented functions", function(assert) {
    assert.throws(
        function() {
            EmulatorTask.blockTask();
        },
            /The emulator task cannot be blocked/,
        "raises"
    );

    assert.throws(
        function() {
            EmulatorTask.wakeupTask();
        },
            /The emulator task is always in wakeup state/,
        "raises"
    );
});

QUnit.test("ExecuteSpecialFunction1", function(assert) {
    var u;

    u = new MicroInstruction(0);
    u.f1 = EmulatorF1.LOAD_RMR;

    assert.ok(true);
});

QUnit.test("Base Task resets shifter on exec", function(assert) {
    var u;

    u = new MicroInstruction(0);

    var called = false;

    doWithMock(Shifter, "reset", function() {
        called = true;
    }, function() {
        Task.executeInstruction(u);
        assert.strictEqual(called, true);
    });
});