
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

//
// Alto CPU
//

// Enums

var BusSource = {
    READ_R:          0,
    LOAD_R:          1,
    NONE:            2,
    TASK_SPECIFIC_1: 3,
    TASK_SPECIFIC_2: 4,
    READ_MD:         5,
    READ_MOUSE:      6,
    READ_DISP:       7
};

// TODO: The manual describes this field as being four bits wide, and
// yet there are only 8 defined values. Why is that?
var SpecialFunction1 = {
    NONE:     0,
    LOAD_MAR: 1,
    TASK:     2,
    BLOCK:    3,
    LLSH1:    4,
    LRSH1:    5,
    LLCY8:    6,
    CONSTANT: 7
};

// TODO: The manual describes this field as being four bits wide, and
// yet there are only 8 defined values. Why is that?
var SpecialFunction2 = {
    NONE:      0,
    BUSEQ0:    1,
    SHLT0:     2,
    SHEQ0:     3,
    BUS:       4,
    ALUCY:     5,
    STORE_MD:  6,
    CONSTANT:  7
};

var AluFunction = {
    BUS:                 0,
    T:                   1,
    BUS_OR_T:            2,
    BUS_AND_T:           3,
    BUS_XOR_T:           4,
    BUS_PLUS_1:          5,
    BUS_MINUS_1:         6,
    BUS_PLUS_T:          7,
    BUS_MINUS_T:         8,
    BUS_MINUS_T_MINUS_1: 9,
    BUS_PLUS_T_PLUS_1:   10,
    BUS_PLUS_SKIP:       11,
    ALU_BUS_AND_T:       12,
    BUS_AND_NOT_T:       13,
    UNDEFINED_1:         14,
    UNDEFINED_2:         15
};

var EmulatorF1 = {
    SWMODE:    8,
    WRTRAM:    9,
    RDRAM:     10,
    LOAD_RMR:  11,
    Unused:    12,
    LOAD_ESRB: 13,
    RSNF:      14,
    STARTF:    15
};

var EmulatorF2 = {
    BUSODD:    8,
    MAGIC:     9,
    LOAD_DNS:  10,
    ACDEST:    11,
    LOAD_IR:   12,
    IDISP:     13,
    ACSOURCE:  14,
    UNUSED:    15
};

var MemoryOperation = {
    NONE:         0,
    LOAD_ADDRESS: 1,
    READ:         2,
    STORE:        3
}

//
// This implements the stripped-down version of the 74181 ALU
// that the Alto exposes to the microcode, and nothing more.
//

var Alu = {

    // State

    carry: 0,

    // Functions

    reset: function() {
        console.log("Resetting ALU.");
        this.carry = 0;
    },

    execute: function(fn, bus, t, skip) {
        var r = 0;

        switch (fn) {
        case AluFunction.BUS:
            this.carry = 0;
            r = bus;
            break;

        case AluFunction.T:
            this.carry = 0;
            r = t;
            break;

        case AluFunction.BUS_OR_T:
            this.carry = 0;
            r = (bus | t);
            break;

        case AluFunction.BUS_AND_T:
        case AluFunction.ALU_BUS_AND_T:
            this.carry = 0;
            r = (bus & t);
            break;

        case AluFunction.BUS_XOR_T:
            this.carry = 0;
            r = (bus ^ t);
            break;

        case AluFunction.BUS_PLUS_1:
            r = bus + 1;
            this.carry = (r > 0xffff) ? 1 : 0;
            break;

        case AluFunction.BUS_MINUS_1:
            r = bus - 1;

            // Because subtraction is actually performed by complementary
            // addition (1s complement), a carry out means borrow; thus, a
            // carry is generated when there is no underflow and no carry is
            // generated when there is underflow.
            this.carry = (r < 0) ? 0 : 1;
            break;

        case AluFunction.BUS_PLUS_T:
            r = bus + t;
            this.carry = (r > 0xffff) ? 1 : 0;
            break;

        case AluFunction.BUS_MINUS_T:
            r = bus - t;
            this.carry = (r < 0) ? 0 : 1;
            break;

        case AluFunction.BUS_MINUS_T_MINUS_1:
            r = bus - t - 1;
            this.carry = (r < 0) ? 0 : 1;
            break;

        case AluFunction.BUS_PLUS_T_PLUS_1:
            r = bus + t + 1;
            this.carry = (r > 0xffff) ? 1 : 0;
            break;

        case AluFunction.BUS_PLUS_SKIP:
            r = bus + skip;
            this.carry = (r > 0xffff) ? 1 : 0;
            break;

        case AluFunction.BUS_AND_NOT_T:
            r = (bus & (~t));
            carry = 0;
            break;

        default:
            throw("Unimplemented Function");
        }

        return r & 0xffff;
    }
};

var Cpu = {
    R_SIZE: 32,
    S_SIZE: 8,
    S_I_SIZE: 32,

    // State

    // CPU Registers
    t:  0,
    l:  0,
    m:  0,
    ir: 0,

    // R and S register files and bank select
    r: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],

    s: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
         0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
         0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
         0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
         0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
         0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
         0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
         0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
         0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],

    // Stores the last carry from the ALU on a Load L
    aluC0: 0,
    rmr: 0,

    // Tasks
    nextTask: undefined,
    currentTask: undefined,
    tasks: [EmulatorTask],

    // Functions

    // Reset the CPU state
    reset: function() {
        var i;

        // Initialize r and s
        for (i = 0; i < this.R_SIZE; i++) {
            this.r[i] = 0;
        }

        for (i = 0; i < this.S_SIZE; i++) {
            for (var j = 0; j < this.S_I_SIZE; j++) {
                this.s[i][j] = 0;
            }
        }

        // Initialize CPU registers
        this.t = 0;
        this.l = 0;
        this.m = 0;
        this.ir = 0;

        this.aluC0 = 0;
        // Start all tasks in ROM0
        this.rmr = 0xffff;

        // reset tasks.
        for (i = 0; i < this.tasks.length; i++) {
            if (this.tasks[i] != undefined) {
                this.tasks[i].reset();
            }
        }

        // Execute the initial task switch
        this.taskSwitch();

        this.currentTask = this.nextTask;
        this.nextTask = undefined;
    },

    // Execute a single clock step
    clock: function() {
        switch(this.currentTask.executeNext()) {
        case InstructionCompletion.TASK_SWITCH:
            // Invoke the task switch, this will take effect after
            // the NEXT instruction completes, not this one.
            this.taskSwitch();
            break;

        case InstructionCompletion.NORMAL:
            if (this.nextTask != undefined) {
                // If we have a new task, switch to it now.
                this.currentTask = this.nextTask;
                this.nextTask = undefined;
                this.currentTask.onTaskSwitch();
            }
            break;

        case InstructionCompletion.MEMORY_WAIT:
            // We were waiting for memory on this cycle, we do nothing
            // (no task switch even if one is pending) in this case.
            break;
        }
    },

    softReset: function() {
        console.log("Soft Reset.");
    },

    // Switch tasks
    taskSwitch: function() {
        for (var i = this.tasks.length - 1; i >= 0; i--) {
            if (this.tasks[i] !== undefined && this.tasks[i].wakeup) {
                console.log("Switching to task: " + this.tasks[i]);
                this.nextTask = this.tasks[i];
                this.nextTask.firstInstructionAfterSwitch = true;
                break;
            }
        }
    }
};

var MicroInstruction = function(code) {

    // Decode fields

    this.rselect = (code >>> 27) & 0x1f;
    this.aluf    = (code >>> 23) & 0x0f;   // ALU Function
    this.bs      = (code >>> 20) & 0x07;   // Bus Source
    this.f1      = (code >>> 16) & 0x0f;   // Special Function 1
    this.f2      = (code >>> 12) & 0x0f;   // Special Function 2
    this.loadT   = ((code >>> 11) & 1) === 0 ? false : true;
    this.loadL   = ((code >>> 10) & 1) === 0 ? false : true;
    this.next    = code & 0x3ff;

    // Whether this instruction references constant memory

    this.constantAccess = (this.f1 == SpecialFunction1.CONSTANT ||
                           this.f2 == SpecialFunction2.CONSTANT);

    this.constantAccessOrBS4 = (this.constantAccess || this.bs > 4);

    // Constant ROM access
    //
    // "The constant memory is gated to the bus by F1=7, F2=7, or
    // BS > 4. The constant memory is addressed by the (8 bit)
    // concatenation of RSELECT and BS. The intent in enabling
    // constants with BS>4 is to provide a masking facility,
    // particularly for the <-MOUSE and <-DISP bus sources. This works
    // because the processor bus ANDs if more than one source is gated
    // to it. Up to 32 such mask contans can be provided for each of
    // the four bus sources > 4."
    //
    // NOTE also:
    //
    // "Note that the [emulator task F2] functions which replace the
    // low bits of RSELECT with IR affect only the selection of R;
    // they do not affect the address supplied to the constant ROM."
    // Hence this can be statically cached without issue.
    this.constantValue = CROM[(this.rselect << 3) | this.bs];

    // Whether this instruction needs the Shifter output This is the
    // only task-specific thing we cache, even if this isn't the right
    // task, worst-case we'll do an operation we didn't need to.
    this.needShifterOutput = (this.f2 == EmulatorF2.LOAD_DNS ||
                              this.f2 == SpecialFunction2.SHEQ0 ||
                              this.f2 == SpecialFunction2.SHLT0);

    // Whether this instruction accesses memory
    this.memoryAccess = ((this.bs == BusSource.READ_MD && !this.constantAccess) ||
                         this.f1 == SpecialFunction1.LOAD_MAR ||
                         this.f2 == SpecialFunction2.STORE_MD);

    if (this.memoryAccess) {
        if (this.f1 == SpecialFunction1.LOAD_MAR) {
            this.memoryOperation = MemoryOperation.LOAD_ADDRESS;
        } else if (this.bs == BusSource.READ_MD) {
            this.memoryOperation = MemoryOperation.READ;
        } else {
            this.memoryOperation = MemoryOperation.STORE;
        }
    } else {
        this.memoryOperation = MemoryOperation.NONE;
    }

    switch(this.aluf) {
    case AluFunction.BUS:
    case AluFunction.BUS_OR_T:
    case AluFunction.BUS_PLUS_1:
    case AluFunction.BUS_MINUS_1:
    case AluFunction.BUS_PLUS_T_PLUS_1:
    case AluFunction.BUS_PLUS_SKIP:
    case AluFunction.ALU_BUS_AND_T:
        this.loadTFromALU = true;
        break;
    default:
        this.loadTFromALU = false;
    }
};


MicroInstruction.prototype.toString = function() {
    return("RSELECT=" + this.rselect.toString(8) +
           " ALUF=" + this.aluf +
           " BS=" + this.bs +
           " F1=" + this.f1 +
           " F2=" + this.f2 +
           " LoadT=" + (this.loadT ? "1" : "0") +
           " LoadL=" + (this.loadL ? "1" : "0") +
           " NEXT=" + this.next.toString(8));
};
