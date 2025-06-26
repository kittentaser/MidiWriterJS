var MidiWriter = (function () {
    'use strict';

    /**
     * MIDI file format constants.
     * @return {Constants}
     */
    const Constants = {
        VERSION: '3.1.1',
        HEADER_CHUNK_TYPE: [0x4d, 0x54, 0x68, 0x64],
        HEADER_CHUNK_LENGTH: [0x00, 0x00, 0x00, 0x06],
        HEADER_CHUNK_FORMAT0: [0x00, 0x00],
        HEADER_CHUNK_FORMAT1: [0x00, 0x01],
        HEADER_CHUNK_DIVISION: [0x25, 0x80],
        TRACK_CHUNK_TYPE: [0x4d, 0x54, 0x72, 0x6b],
        META_EVENT_ID: 0xFF,
        META_SMTPE_OFFSET: 0x54
    };

    // src/utils.ts
    var fillStr = (s, n) => Array(Math.abs(n) + 1).join(s);

    // src/named.ts
    function isNamed(src) {
      return src !== null && typeof src === "object" && typeof src.name === "string" ? true : false;
    }

    // src/pitch.ts
    function isPitch(pitch) {
      return pitch !== null && typeof pitch === "object" && typeof pitch.step === "number" && typeof pitch.alt === "number" ? true : false;
    }
    var FIFTHS = [0, 2, 4, -1, 1, 3, 5];
    var STEPS_TO_OCTS = FIFTHS.map(
      (fifths) => Math.floor(fifths * 7 / 12)
    );
    function encode(pitch) {
      const { step, alt, oct, dir = 1 } = pitch;
      const f = FIFTHS[step] + 7 * alt;
      if (oct === void 0) {
        return [dir * f];
      }
      const o = oct - STEPS_TO_OCTS[step] - 4 * alt;
      return [dir * f, dir * o];
    }

    // src/note.ts
    var NoNote = { empty: true, name: "", pc: "", acc: "" };
    var cache = /* @__PURE__ */ new Map();
    var stepToLetter = (step) => "CDEFGAB".charAt(step);
    var altToAcc = (alt) => alt < 0 ? fillStr("b", -alt) : fillStr("#", alt);
    var accToAlt = (acc) => acc[0] === "b" ? -acc.length : acc.length;
    function note(src) {
      const stringSrc = JSON.stringify(src);
      const cached = cache.get(stringSrc);
      if (cached) {
        return cached;
      }
      const value = typeof src === "string" ? parse(src) : isPitch(src) ? note(pitchName(src)) : isNamed(src) ? note(src.name) : NoNote;
      cache.set(stringSrc, value);
      return value;
    }
    var REGEX = /^([a-gA-G]?)(#{1,}|b{1,}|x{1,}|)(-?\d*)\s*(.*)$/;
    function tokenizeNote(str) {
      const m = REGEX.exec(str);
      return [m[1].toUpperCase(), m[2].replace(/x/g, "##"), m[3], m[4]];
    }
    var mod = (n, m) => (n % m + m) % m;
    var SEMI = [0, 2, 4, 5, 7, 9, 11];
    function parse(noteName) {
      const tokens = tokenizeNote(noteName);
      if (tokens[0] === "" || tokens[3] !== "") {
        return NoNote;
      }
      const letter = tokens[0];
      const acc = tokens[1];
      const octStr = tokens[2];
      const step = (letter.charCodeAt(0) + 3) % 7;
      const alt = accToAlt(acc);
      const oct = octStr.length ? +octStr : void 0;
      const coord = encode({ step, alt, oct });
      const name = letter + acc + octStr;
      const pc = letter + acc;
      const chroma = (SEMI[step] + alt + 120) % 12;
      const height = oct === void 0 ? mod(SEMI[step] + alt, 12) - 12 * 99 : SEMI[step] + alt + 12 * (oct + 1);
      const midi = height >= 0 && height <= 127 ? height : null;
      const freq = oct === void 0 ? null : Math.pow(2, (height - 69) / 12) * 440;
      return {
        empty: false,
        acc,
        alt,
        chroma,
        coord,
        freq,
        height,
        letter,
        midi,
        name,
        oct,
        pc,
        step
      };
    }
    function pitchName(props) {
      const { step, alt, oct } = props;
      const letter = stepToLetter(step);
      if (!letter) {
        return "";
      }
      const pc = letter + altToAcc(alt);
      return oct || oct === 0 ? pc + oct : pc;
    }

    // index.ts
    function isMidi(arg) {
      return +arg >= 0 && +arg <= 127;
    }
    function toMidi(note$1) {
      if (isMidi(note$1)) {
        return +note$1;
      }
      const n = note(note$1);
      return n.empty ? null : n.midi;
    }

    /**
     * Static utility functions used throughout the library.
     */
    class Utils {
        /**
         * Gets MidiWriterJS version number.
         * @return {string}
         */
        static version() {
            return Constants.VERSION;
        }
        /**
         * Convert a string to an array of bytes
         * @param {string} string
         * @return {array}
         */
        static stringToBytes(string) {
            return string.split('').map(char => char.charCodeAt(0));
        }
        /**
         * Checks if argument is a valid number.
         * @param {*} n - Value to check
         * @return {boolean}
         */
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        static isNumeric(n) {
            return !isNaN(parseFloat(n)) && isFinite(n);
        }
        /**
         * Returns the correct MIDI number for the specified pitch.
         * Uses Tonal Midi - https://github.com/danigb/tonal/tree/master/packages/midi
         * @param {(string|number)} pitch - 'C#4' or midi note code
         * @param {string} middleC
         * @return {number}
         */
        static getPitch(pitch, middleC = 'C4') {
            return 60 - toMidi(middleC) + toMidi(pitch);
        }
        /**
         * Translates number of ticks to MIDI timestamp format, returning an array of
         * hex strings with the time values. Midi has a very particular time to express time,
         * take a good look at the spec before ever touching this function.
         * Thanks to https://github.com/sergi/jsmidi
         *
         * @param {number} ticks - Number of ticks to be translated
         * @return {array} - Bytes that form the MIDI time value
         */
        static numberToVariableLength(ticks) {
            ticks = Math.round(ticks);
            let buffer = ticks & 0x7F;
            // eslint-disable-next-line no-cond-assign
            while (ticks = ticks >> 7) {
                buffer <<= 8;
                buffer |= ((ticks & 0x7F) | 0x80);
            }
            const bList = [];
            // eslint-disable-next-line no-constant-condition
            while (true) {
                bList.push(buffer & 0xff);
                if (buffer & 0x80)
                    buffer >>= 8;
                else {
                    break;
                }
            }
            return bList;
        }
        /**
         * Counts number of bytes in string
         * @param {string} s
         * @return {number}
         */
        static stringByteCount(s) {
            return encodeURI(s).split(/%..|./).length - 1;
        }
        /**
         * Get an int from an array of bytes.
         * @param {array} bytes
         * @return {number}
         */
        static numberFromBytes(bytes) {
            let hex = '';
            let stringResult;
            bytes.forEach((byte) => {
                stringResult = byte.toString(16);
                // ensure string is 2 chars
                if (stringResult.length == 1)
                    stringResult = "0" + stringResult;
                hex += stringResult;
            });
            return parseInt(hex, 16);
        }
        /**
         * Takes a number and splits it up into an array of bytes.  Can be padded by passing a number to bytesNeeded
         * @param {number} number
         * @param {number} bytesNeeded
         * @return {array} - Array of bytes
         */
        static numberToBytes(number, bytesNeeded) {
            bytesNeeded = bytesNeeded || 1;
            let hexString = number.toString(16);
            if (hexString.length & 1) { // Make sure hex string is even number of chars
                hexString = '0' + hexString;
            }
            // Split hex string into an array of two char elements
            const hexArray = hexString.match(/.{2}/g);
            // Now parse them out as integers
            const intArray = hexArray.map(item => parseInt(item, 16));
            // Prepend empty bytes if we don't have enough
            if (intArray.length < bytesNeeded) {
                while (bytesNeeded - intArray.length > 0) {
                    intArray.unshift(0);
                }
            }
            return intArray;
        }
        /**
         * Converts value to array if needed.
         * @param {any} value
         * @return {array}
         */
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        static toArray(value) {
            if (Array.isArray(value))
                return value;
            return [value];
        }
        /**
         * Converts velocity to value 0-127
         * @param {number} velocity - Velocity value 1-100
         * @return {number}
         */
        static convertVelocity(velocity) {
            // Max passed value limited to 100
            velocity = velocity > 100 ? 100 : velocity;
            return Math.round(velocity / 100 * 127);
        }
        /**
         * Gets the total number of ticks of a specified duration.
         * Note: type=='note' defaults to quarter note, type==='rest' defaults to 0
         * @param {(string|array)} duration
         * @return {number}
         */
        static getTickDuration(duration) {
            if (Array.isArray(duration)) {
                // Recursively execute this method for each item in the array and return the sum of tick durations.
                return duration.map((value) => {
                    return Utils.getTickDuration(value);
                }).reduce((a, b) => {
                    return a + b;
                }, 0);
            }
            duration = duration.toString();
            if (duration.toLowerCase().charAt(0) === 't') {
                // If duration starts with 't' then the number that follows is an explicit tick count
                const ticks = parseInt(duration.substring(1));
                if (isNaN(ticks) || ticks < 0) {
                    throw new Error(duration + ' is not a valid duration.');
                }
                return ticks;
            }
            // Need to apply duration here.  Quarter note == Constants.HEADER_CHUNK_DIVISION
            const quarterTicks = Utils.numberFromBytes(Constants.HEADER_CHUNK_DIVISION);
            const tickDuration = quarterTicks * Utils.getDurationMultiplier(duration);
            return Utils.getRoundedIfClose(tickDuration);
        }
        /**
         * Due to rounding errors in JavaScript engines,
         * it's safe to round when we're very close to the actual tick number
         *
         * @static
         * @param {number} tick
         * @return {number}
         */
        static getRoundedIfClose(tick) {
            const roundedTick = Math.round(tick);
            return Math.abs(roundedTick - tick) < 0.000001 ? roundedTick : tick;
        }
        /**
         * Due to low precision of MIDI,
         * we need to keep track of rounding errors in deltas.
         * This function will calculate the rounding error for a given duration.
         *
         * @static
         * @param {number} tick
         * @return {number}
         */
        static getPrecisionLoss(tick) {
            const roundedTick = Math.round(tick);
            return roundedTick - tick;
        }
        /**
         * Gets what to multiple ticks/quarter note by to get the specified duration.
         * Note: type=='note' defaults to quarter note, type==='rest' defaults to 0
         * @param {string} duration
         * @return {number}
         */
        static getDurationMultiplier(duration) {
            // Need to apply duration here.
            // Quarter note == Constants.HEADER_CHUNK_DIVISION ticks.
            if (duration === '0')
                return 0;
            const match = duration.match(/^(?<dotted>d+)?(?<base>\d+)(?:t(?<tuplet>\d*))?/);
            if (match) {
                const base = Number(match.groups.base);
                // 1 or any power of two:
                const isValidBase = base === 1 || ((base & (base - 1)) === 0);
                if (isValidBase) {
                    // how much faster or slower is this note compared to a quarter?
                    const ratio = base / 4;
                    let durationInQuarters = 1 / ratio;
                    const { dotted, tuplet } = match.groups;
                    if (dotted) {
                        const thisManyDots = dotted.length;
                        const divisor = Math.pow(2, thisManyDots);
                        durationInQuarters = durationInQuarters + (durationInQuarters * ((divisor - 1) / divisor));
                    }
                    if (typeof tuplet === 'string') {
                        const fitInto = durationInQuarters * 2;
                        // default to triplet:
                        const thisManyNotes = Number(tuplet || '3');
                        durationInQuarters = fitInto / thisManyNotes;
                    }
                    return durationInQuarters;
                }
            }
            throw new Error(duration + ' is not a valid duration.');
        }
    }

    /**
     * Holds all data for a "controller change" MIDI event
     * @param {object} fields {controllerNumber: integer, controllerValue: integer, delta: integer}
     * @return {ControllerChangeEvent}
     */
    class ControllerChangeEvent {
        constructor(fields) {
            this.channel = fields.channel - 1 || 0;
            this.controllerValue = fields.controllerValue;
            this.controllerNumber = fields.controllerNumber;
            this.delta = fields.delta || 0x00;
            this.name = 'ControllerChangeEvent';
            this.status = 0xB0;
            this.data = Utils.numberToVariableLength(fields.delta).concat(this.status | this.channel, this.controllerNumber, this.controllerValue);
        }
    }

    /**
     * Object representation of a tempo meta event.
     * @param {object} fields {text: string, delta: integer}
     * @return {CopyrightEvent}
     */
    class CopyrightEvent {
        constructor(fields) {
            this.delta = fields.delta || 0x00;
            this.name = 'CopyrightEvent';
            this.text = fields.text;
            this.type = 0x02;
            const textBytes = Utils.stringToBytes(this.text);
            // Start with zero time delta
            this.data = Utils.numberToVariableLength(this.delta).concat(Constants.META_EVENT_ID, this.type, Utils.numberToVariableLength(textBytes.length), // Size
            textBytes);
        }
    }

    /**
     * Object representation of a cue point meta event.
     * @param {object} fields {text: string, delta: integer}
     * @return {CuePointEvent}
     */
    class CuePointEvent {
        constructor(fields) {
            this.delta = fields.delta || 0x00;
            this.name = 'CuePointEvent';
            this.text = fields.text;
            this.type = 0x07;
            const textBytes = Utils.stringToBytes(this.text);
            // Start with zero time delta
            this.data = Utils.numberToVariableLength(this.delta).concat(Constants.META_EVENT_ID, this.type, Utils.numberToVariableLength(textBytes.length), // Size
            textBytes);
        }
    }

    /**
     * Object representation of a end track meta event.
     * @param {object} fields {delta: integer}
     * @return {EndTrackEvent}
     */
    class EndTrackEvent {
        constructor(fields) {
            this.delta = (fields === null || fields === void 0 ? void 0 : fields.delta) || 0x00;
            this.name = 'EndTrackEvent';
            this.type = [0x2F, 0x00];
            // Start with zero time delta
            this.data = Utils.numberToVariableLength(this.delta).concat(Constants.META_EVENT_ID, this.type);
        }
    }

    /**
     * Object representation of an instrument name meta event.
     * @param {object} fields {text: string, delta: integer}
     * @return {InstrumentNameEvent}
     */
    class InstrumentNameEvent {
        constructor(fields) {
            this.delta = fields.delta || 0x00;
            this.name = 'InstrumentNameEvent';
            this.text = fields.text;
            this.type = 0x04;
            const textBytes = Utils.stringToBytes(this.text);
            // Start with zero time delta
            this.data = Utils.numberToVariableLength(this.delta).concat(Constants.META_EVENT_ID, this.type, Utils.numberToVariableLength(textBytes.length), // Size
            textBytes);
        }
    }

    /**
     * Object representation of a key signature meta event.
     * @return {KeySignatureEvent}
     */
    class KeySignatureEvent {
        constructor(sf, mi) {
            this.name = 'KeySignatureEvent';
            this.type = 0x59;
            let mode = mi || 0;
            sf = sf || 0;
            //	Function called with string notation
            if (typeof mi === 'undefined') {
                const fifths = [
                    ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'],
                    ['ab', 'eb', 'bb', 'f', 'c', 'g', 'd', 'a', 'e', 'b', 'f#', 'c#', 'g#', 'd#', 'a#']
                ];
                const _sflen = sf.length;
                let note = sf || 'C';
                if (sf[0] === sf[0].toLowerCase())
                    mode = 1;
                if (_sflen > 1) {
                    switch (sf.charAt(_sflen - 1)) {
                        case 'm':
                            mode = 1;
                            note = sf.charAt(0).toLowerCase();
                            note = note.concat(sf.substring(1, _sflen - 1));
                            break;
                        case '-':
                            mode = 1;
                            note = sf.charAt(0).toLowerCase();
                            note = note.concat(sf.substring(1, _sflen - 1));
                            break;
                        case 'M':
                            mode = 0;
                            note = sf.charAt(0).toUpperCase();
                            note = note.concat(sf.substring(1, _sflen - 1));
                            break;
                        case '+':
                            mode = 0;
                            note = sf.charAt(0).toUpperCase();
                            note = note.concat(sf.substring(1, _sflen - 1));
                            break;
                    }
                }
                const fifthindex = fifths[mode].indexOf(note);
                sf = fifthindex === -1 ? 0 : fifthindex - 7;
            }
            // Start with zero time delta
            this.data = Utils.numberToVariableLength(0x00).concat(Constants.META_EVENT_ID, this.type, [0x02], // Size
            Utils.numberToBytes(sf, 1), // Number of sharp or flats ( < 0 flat; > 0 sharp)
            Utils.numberToBytes(mode, 1));
        }
    }

    /**
     * Object representation of a lyric meta event.
     * @param {object} fields {text: string, delta: integer}
     * @return {LyricEvent}
     */
    class LyricEvent {
        constructor(fields) {
            this.delta = fields.delta || 0x00;
            this.name = 'LyricEvent';
            this.text = fields.text;
            this.type = 0x05;
            const textBytes = Utils.stringToBytes(this.text);
            // Start with zero time delta
            this.data = Utils.numberToVariableLength(this.delta).concat(Constants.META_EVENT_ID, this.type, Utils.numberToVariableLength(textBytes.length), // Size
            textBytes);
        }
    }

    /**
     * Object representation of a marker meta event.
     * @param {object} fields {text: string, delta: integer}
     * @return {MarkerEvent}
     */
    class MarkerEvent {
        constructor(fields) {
            this.delta = fields.delta || 0x00;
            this.name = 'MarkerEvent';
            this.text = fields.text;
            this.type = 0x06;
            const textBytes = Utils.stringToBytes(this.text);
            // Start with zero time delta
            this.data = Utils.numberToVariableLength(this.delta).concat(Constants.META_EVENT_ID, this.type, Utils.numberToVariableLength(textBytes.length), // Size
            textBytes);
        }
    }

    /**
     * Holds all data for a "note on" MIDI event
     * @param {object} fields {data: []}
     * @return {NoteOnEvent}
     */
    class NoteOnEvent {
        constructor(fields) {
            this.name = 'NoteOnEvent';
            this.channel = fields.channel || 1;
            this.pitch = fields.pitch;
            this.wait = fields.wait || 0;
            this.velocity = fields.velocity || 50;
            this.tick = fields.tick || null;
            this.delta = null;
            this.data = fields.data;
            this.status = 0x90;
        }
        /**
         * Builds int array for this event.
         * @param {Track} track - parent track
         * @return {NoteOnEvent}
         */
        buildData(track, precisionDelta, options = {}) {
            this.data = [];
            // Explicitly defined startTick event
            if (this.tick) {
                this.tick = Utils.getRoundedIfClose(this.tick);
                // If this is the first event in the track then use event's starting tick as delta.
                if (track.tickPointer == 0) {
                    this.delta = this.tick;
                }
            }
            else {
                this.delta = Utils.getTickDuration(this.wait);
                this.tick = Utils.getRoundedIfClose(track.tickPointer + this.delta);
            }
            this.deltaWithPrecisionCorrection = Utils.getRoundedIfClose(this.delta - precisionDelta);
            this.data = Utils.numberToVariableLength(this.deltaWithPrecisionCorrection)
                .concat(this.status | this.channel - 1, Utils.getPitch(this.pitch, options.middleC), Utils.convertVelocity(this.velocity));
            return this;
        }
    }

    /**
     * Holds all data for a "note off" MIDI event
     * @param {object} fields {data: []}
     * @return {NoteOffEvent}
     */
    class NoteOffEvent {
        constructor(fields) {
            this.name = 'NoteOffEvent';
            this.channel = fields.channel || 1;
            this.pitch = fields.pitch;
            this.velocity = fields.velocity || 50;
            this.tick = fields.tick || null;
            this.data = fields.data;
            this.delta = fields.delta || Utils.getTickDuration(fields.duration);
            this.status = 0x80;
        }
        /**
         * Builds int array for this event.
         * @param {Track} track - parent track
         * @return {NoteOffEvent}
         */
        buildData(track, precisionDelta, options = {}) {
            if (this.tick === null) {
                this.tick = Utils.getRoundedIfClose(this.delta + track.tickPointer);
            }
            this.deltaWithPrecisionCorrection = Utils.getRoundedIfClose(this.delta - precisionDelta);
            this.data = Utils.numberToVariableLength(this.deltaWithPrecisionCorrection)
                .concat(this.status | this.channel - 1, Utils.getPitch(this.pitch, options.middleC), Utils.convertVelocity(this.velocity));
            return this;
        }
    }

    /**
     * Wrapper for noteOnEvent/noteOffEvent objects that builds both events.
     * @param {object} fields - {pitch: '[C4]', duration: '4', wait: '4', velocity: 1-100}
     * @return {NoteEvent}
     */
    class NoteEvent {
        constructor(fields) {
            this.data = [];
            this.name = 'NoteEvent';
            this.pitch = Utils.toArray(fields.pitch);
            this.channel = fields.channel || 1;
            this.duration = fields.duration || '4';
            this.grace = fields.grace;
            this.repeat = fields.repeat || 1;
            this.sequential = fields.sequential || false;
            this.tick = fields.startTick || fields.tick || null;
            this.velocity = fields.velocity || 50;
            this.wait = fields.wait || 0;
            this.tickDuration = Utils.getTickDuration(this.duration);
            this.restDuration = Utils.getTickDuration(this.wait);
            this.events = []; // Hold actual NoteOn/NoteOff events
        }
        /**
         * Builds int array for this event.
         * @return {NoteEvent}
         */
        buildData() {
            // Reset data array
            this.data = [];
            // Apply grace note(s) and subtract ticks (currently 1 tick per grace note) from tickDuration so net value is the same
            if (this.grace) {
                const graceDuration = 1;
                this.grace = Utils.toArray(this.grace);
                this.grace.forEach(() => {
                    const noteEvent = new NoteEvent({ pitch: this.grace, duration: 'T' + graceDuration });
                    this.data = this.data.concat(noteEvent.data);
                });
            }
            // fields.pitch could be an array of pitches.
            // If so create note events for each and apply the same duration.
            // By default this is a chord if it's an array of notes that requires one NoteOnEvent.
            // If this.sequential === true then it's a sequential string of notes that requires separate NoteOnEvents.
            if (!this.sequential) {
                // Handle repeat
                for (let j = 0; j < this.repeat; j++) {
                    // Note on
                    this.pitch.forEach((p, i) => {
                        let noteOnNew;
                        if (i == 0) {
                            noteOnNew = new NoteOnEvent({
                                channel: this.channel,
                                wait: this.wait,
                                delta: Utils.getTickDuration(this.wait),
                                velocity: this.velocity,
                                pitch: p,
                                tick: this.tick,
                            });
                        }
                        else {
                            // Running status (can ommit the note on status)
                            //noteOn = new NoteOnEvent({data: [0, Utils.getPitch(p), Utils.convertVelocity(this.velocity)]});
                            noteOnNew = new NoteOnEvent({
                                channel: this.channel,
                                wait: 0,
                                delta: 0,
                                velocity: this.velocity,
                                pitch: p,
                                tick: this.tick,
                            });
                        }
                        this.events.push(noteOnNew);
                    });
                    // Note off
                    this.pitch.forEach((p, i) => {
                        let noteOffNew;
                        if (i == 0) {
                            //noteOff = new NoteOffEvent({data: Utils.numberToVariableLength(tickDuration).concat(this.getNoteOffStatus(), Utils.getPitch(p), Utils.convertVelocity(this.velocity))});
                            noteOffNew = new NoteOffEvent({
                                channel: this.channel,
                                duration: this.duration,
                                velocity: this.velocity,
                                pitch: p,
                                tick: this.tick !== null ? Utils.getTickDuration(this.duration) + this.tick : null,
                            });
                        }
                        else {
                            // Running status (can omit the note off status)
                            //noteOff = new NoteOffEvent({data: [0, Utils.getPitch(p), Utils.convertVelocity(this.velocity)]});
                            noteOffNew = new NoteOffEvent({
                                channel: this.channel,
                                duration: 0,
                                velocity: this.velocity,
                                pitch: p,
                                tick: this.tick !== null ? Utils.getTickDuration(this.duration) + this.tick : null,
                            });
                        }
                        this.events.push(noteOffNew);
                    });
                }
            }
            else {
                // Handle repeat
                for (let j = 0; j < this.repeat; j++) {
                    this.pitch.forEach((p, i) => {
                        const noteOnNew = new NoteOnEvent({
                            channel: this.channel,
                            wait: (i > 0 ? 0 : this.wait),
                            delta: (i > 0 ? 0 : Utils.getTickDuration(this.wait)),
                            velocity: this.velocity,
                            pitch: p,
                            tick: this.tick,
                        });
                        const noteOffNew = new NoteOffEvent({
                            channel: this.channel,
                            duration: this.duration,
                            velocity: this.velocity,
                            pitch: p,
                        });
                        this.events.push(noteOnNew, noteOffNew);
                    });
                }
            }
            return this;
        }
    }

    /**
     * Holds all data for a "Pitch Bend" MIDI event
     * [ -1.0, 0, 1.0 ] ->  [ 0, 8192, 16383]
     * @param {object} fields { bend : float, channel : int, delta: int }
     * @return {PitchBendEvent}
     */
    class PitchBendEvent {
        constructor(fields) {
            this.channel = fields.channel || 0;
            this.delta = fields.delta || 0x00;
            this.name = 'PitchBendEvent';
            this.status = 0xE0;
            const bend14 = this.scale14bits(fields.bend);
            const lsbValue = bend14 & 0x7f;
            const msbValue = (bend14 >> 7) & 0x7f;
            this.data = Utils.numberToVariableLength(this.delta).concat(this.status | this.channel, lsbValue, msbValue);
        }
        scale14bits(zeroOne) {
            if (zeroOne <= 0) {
                return Math.floor(16384 * (zeroOne + 1) / 2);
            }
            return Math.floor(16383 * (zeroOne + 1) / 2);
        }
    }

    /**
     * Holds all data for a "program change" MIDI event
     * @param {object} fields {instrument: integer, delta: integer}
     * @return {ProgramChangeEvent}
     */
    class ProgramChangeEvent {
        constructor(fields) {
            this.channel = fields.channel || 0;
            this.delta = fields.delta || 0x00;
            this.instrument = fields.instrument;
            this.status = 0xC0;
            this.name = 'ProgramChangeEvent';
            // delta time defaults to 0.
            this.data = Utils.numberToVariableLength(this.delta).concat(this.status | this.channel, this.instrument);
        }
    }

    /**
     * Object representation of a tempo meta event.
     * @param {object} fields {bpm: integer, delta: integer}
     * @return {TempoEvent}
     */
    class TempoEvent {
        constructor(fields) {
            this.bpm = fields.bpm;
            this.delta = fields.delta || 0x00;
            this.tick = fields.tick;
            this.name = 'TempoEvent';
            this.type = 0x51;
            const tempo = Math.round(60000000 / this.bpm);
            // Start with zero time delta
            this.data = Utils.numberToVariableLength(this.delta).concat(Constants.META_EVENT_ID, this.type, [0x03], // Size
            Utils.numberToBytes(tempo, 3));
        }
    }

    /**
     * Object representation of a tempo meta event.
     * @param {object} fields {text: string, delta: integer}
     * @return {TextEvent}
     */
    class TextEvent {
        constructor(fields) {
            this.delta = fields.delta || 0x00;
            this.text = fields.text;
            this.name = 'TextEvent';
            this.type = 0x01;
            const textBytes = Utils.stringToBytes(this.text);
            // Start with zero time delta
            this.data = Utils.numberToVariableLength(fields.delta).concat(Constants.META_EVENT_ID, this.type, Utils.numberToVariableLength(textBytes.length), // Size
            textBytes);
        }
    }

    /**
     * Object representation of a time signature meta event.
     * @return {TimeSignatureEvent}
     */
    class TimeSignatureEvent {
        constructor(numerator, denominator, midiclockspertick, notespermidiclock) {
            this.name = 'TimeSignatureEvent';
            this.type = 0x58;
            // Start with zero time delta
            this.data = Utils.numberToVariableLength(0x00).concat(Constants.META_EVENT_ID, this.type, [0x04], // Size
            Utils.numberToBytes(numerator, 1), // Numerator, 1 bytes
            Utils.numberToBytes(Math.log2(denominator), 1), // Denominator is expressed as pow of 2, 1 bytes
            Utils.numberToBytes(midiclockspertick || 24, 1), // MIDI Clocks per tick, 1 bytes
            Utils.numberToBytes(notespermidiclock || 8, 1));
        }
    }

    /**
     * Object representation of a tempo meta event.
     * @param {object} fields {text: string, delta: integer}
     * @return {TrackNameEvent}
     */
    class TrackNameEvent {
        constructor(fields) {
            this.delta = fields.delta || 0x00;
            this.name = 'TrackNameEvent';
            this.text = fields.text;
            this.type = 0x03;
            const textBytes = Utils.stringToBytes(this.text);
            // Start with zero time delta
            this.data = Utils.numberToVariableLength(this.delta).concat(Constants.META_EVENT_ID, this.type, Utils.numberToVariableLength(textBytes.length), // Size
            textBytes);
        }
    }

    /**
     * Holds all data for a track.
     * @param {object} fields {type: number, data: array, size: array, events: array}
     * @return {Track}
     */
    class Track {
        constructor() {
            this.type = Constants.TRACK_CHUNK_TYPE;
            this.data = [];
            this.size = [];
            this.events = [];
            this.explicitTickEvents = [];
            // If there are any events with an explicit tick defined then we will create a "sub" track for those
            // and merge them in and the end.
            this.tickPointer = 0; // Each time an event is added this will increase
        }
        /**
         * Adds any event type to the track.
         * Events without a specific startTick property are assumed to be added in order of how they should output.
         * Events with a specific startTick property are set aside for now will be merged in during build process.
         *
         * TODO: Don't put startTick events in their own array.  Just lump everything together and sort it out during buildData();
         * @param {(NoteEvent|ProgramChangeEvent)} events - Event object or array of Event objects.
         * @param {Function} mapFunction - Callback which can be used to apply specific properties to all events.
         * @return {Track}
         */
        addEvent(events, mapFunction) {
            Utils.toArray(events).forEach((event, i) => {
                if (event instanceof NoteEvent) {
                    // Handle map function if provided
                    if (typeof mapFunction === 'function') {
                        const properties = mapFunction(i, event);
                        if (typeof properties === 'object') {
                            Object.assign(event, properties);
                        }
                    }
                    // If this note event has an explicit startTick then we need to set aside for now
                    if (event.tick !== null) {
                        this.explicitTickEvents.push(event);
                    }
                    else {
                        // Push each on/off event to track's event stack
                        event.buildData().events.forEach((e) => this.events.push(e));
                    }
                }
                else {
                    this.events.push(event);
                }
            });
            return this;
        }
        /**
         * Builds int array of all events.
         * @param {object} options
         * @return {Track}
         */
        buildData(options = {}) {
            // Reset
            this.data = [];
            this.size = [];
            this.tickPointer = 0;
            let precisionLoss = 0;
            this.events.forEach((event) => {
                // Build event & add to total tick duration
                if (event instanceof NoteOnEvent || event instanceof NoteOffEvent) {
                    const built = event.buildData(this, precisionLoss, options);
                    precisionLoss = Utils.getPrecisionLoss(event.deltaWithPrecisionCorrection || 0);
                    this.data = this.data.concat(built.data);
                    this.tickPointer = Utils.getRoundedIfClose(event.tick);
                }
                else if (event instanceof TempoEvent) {
                    this.tickPointer = Utils.getRoundedIfClose(event.tick);
                    this.data = this.data.concat(event.data);
                }
                else {
                    this.data = this.data.concat(event.data);
                }
            });
            this.mergeExplicitTickEvents();
            // If the last event isn't EndTrackEvent, then tack it onto the data.
            if (!this.events.length || !(this.events[this.events.length - 1] instanceof EndTrackEvent)) {
                this.data = this.data.concat((new EndTrackEvent).data);
            }
            this.size = Utils.numberToBytes(this.data.length, 4); // 4 bytes long
            return this;
        }
        mergeExplicitTickEvents() {
            if (!this.explicitTickEvents.length)
                return;
            // First sort asc list of events by startTick
            this.explicitTickEvents.sort((a, b) => a.tick - b.tick);
            // Now this.explicitTickEvents is in correct order, and so is this.events naturally.
            // For each explicit tick event, splice it into the main list of events and
            // adjust the delta on the following events so they still play normally.
            this.explicitTickEvents.forEach((noteEvent) => {
                // Convert NoteEvent to it's respective NoteOn/NoteOff events
                // Note that as we splice in events the delta for the NoteOff ones will
                // Need to change based on what comes before them after the splice.
                noteEvent.buildData().events.forEach((e) => e.buildData(this));
                // Merge each event individually into this track's event list.
                noteEvent.events.forEach((event) => this.mergeSingleEvent(event));
            });
            // Hacky way to rebuild track with newly spliced events.  Need better solution.
            this.explicitTickEvents = [];
            this.buildData();
        }
        /**
         * Merges another track's events with this track.
         * @param {Track} track
         * @return {Track}
         */
        mergeTrack(track) {
            // First build this track to populate each event's tick property
            this.buildData();
            // Then build track to be merged so that tick property is populated on all events & merge each event.
            track.buildData().events.forEach((event) => this.mergeSingleEvent(event));
            return this;
        }
        /**
         * Merges a single event into this track's list of events based on event.tick property.
         * @param {AbstractEvent} - event
         * @return {Track}
         */
        mergeSingleEvent(event) {
            // There are no events yet, so just add it in.
            if (!this.events.length) {
                this.addEvent(event);
                return;
            }
            // Find index of existing event we need to follow with
            let lastEventIndex;
            for (let i = 0; i < this.events.length; i++) {
                if (this.events[i].tick > event.tick)
                    break;
                lastEventIndex = i;
            }
            const splicedEventIndex = lastEventIndex + 1;
            // Need to adjust the delta of this event to ensure it falls on the correct tick.
            event.delta = event.tick - this.events[lastEventIndex].tick;
            // Splice this event at lastEventIndex + 1
            this.events.splice(splicedEventIndex, 0, event);
            // Now adjust delta of all following events
            for (let i = splicedEventIndex + 1; i < this.events.length; i++) {
                // Since each existing event should have a tick value at this point we just need to
                // adjust delta to that the event still falls on the correct tick.
                this.events[i].delta = this.events[i].tick - this.events[i - 1].tick;
            }
        }
        /**
         * Removes all events matching specified type.
         * @param {string} eventName - Event type
         * @return {Track}
         */
        removeEventsByName(eventName) {
            this.events.forEach((event, index) => {
                if (event.name === eventName) {
                    this.events.splice(index, 1);
                }
            });
            return this;
        }
        /**
         * Sets tempo of the MIDI file.
         * @param {number} bpm - Tempo in beats per minute.
         * @param {number} tick - Start tick.
         * @return {Track}
         */
        setTempo(bpm, tick = 0) {
            return this.addEvent(new TempoEvent({ bpm, tick }));
        }
        /**
         * Sets time signature.
         * @param {number} numerator - Top number of the time signature.
         * @param {number} denominator - Bottom number of the time signature.
         * @param {number} midiclockspertick - Defaults to 24.
         * @param {number} notespermidiclock - Defaults to 8.
         * @return {Track}
         */
        setTimeSignature(numerator, denominator, midiclockspertick, notespermidiclock) {
            return this.addEvent(new TimeSignatureEvent(numerator, denominator, midiclockspertick, notespermidiclock));
        }
        /**
         * Sets key signature.
         * @param {*} sf -
         * @param {*} mi -
         * @return {Track}
         */
        setKeySignature(sf, mi) {
            return this.addEvent(new KeySignatureEvent(sf, mi));
        }
        /**
         * Adds text to MIDI file.
         * @param {string} text - Text to add.
         * @return {Track}
         */
        addText(text) {
            return this.addEvent(new TextEvent({ text }));
        }
        /**
         * Adds copyright to MIDI file.
         * @param {string} text - Text of copyright line.
         * @return {Track}
         */
        addCopyright(text) {
            return this.addEvent(new CopyrightEvent({ text }));
        }
        /**
         * Adds Sequence/Track Name.
         * @param {string} text - Text of track name.
         * @return {Track}
         */
        addTrackName(text) {
            return this.addEvent(new TrackNameEvent({ text }));
        }
        /**
         * Sets instrument name of track.
         * @param {string} text - Name of instrument.
         * @return {Track}
         */
        addInstrumentName(text) {
            return this.addEvent(new InstrumentNameEvent({ text }));
        }
        /**
         * Adds marker to MIDI file.
         * @param {string} text - Marker text.
         * @return {Track}
         */
        addMarker(text) {
            return this.addEvent(new MarkerEvent({ text }));
        }
        /**
         * Adds cue point to MIDI file.
         * @param {string} text - Text of cue point.
         * @return {Track}
         */
        addCuePoint(text) {
            return this.addEvent(new CuePointEvent({ text }));
        }
        /**
         * Adds lyric to MIDI file.
         * @param {string} text - Lyric text to add.
         * @return {Track}
         */
        addLyric(text) {
            return this.addEvent(new LyricEvent({ text }));
        }
        /**
         * Channel mode messages
         * @return {Track}
         */
        polyModeOn() {
            const event = new NoteOnEvent({ data: [0x00, 0xB0, 0x7E, 0x00] });
            return this.addEvent(event);
        }
        /**
         * Sets a pitch bend.
         * @param {float} bend - Bend value ranging [-1,1], zero meaning no bend.
         * @return {Track}
         */
        setPitchBend(bend) {
            return this.addEvent(new PitchBendEvent({ bend }));
        }
        /**
         * Adds a controller change event
         * @param {number} number - Control number.
         * @param {number} value - Control value.
         * @param {number} channel - Channel to send controller change event on (1-based).
         * @param {number} delta - Track tick offset for cc event.
         * @return {Track}
         */
        controllerChange(number, value, channel, delta) {
            return this.addEvent(new ControllerChangeEvent({ controllerNumber: number, controllerValue: value, channel: channel, delta: delta }));
        }
    }

    class VexFlow {
        /**
         * Support for converting VexFlow voice into MidiWriterJS track
         * @return MidiWriter.Track object
         */
        trackFromVoice(voice, options = { addRenderedAccidentals: false }) {
            const track = new Track;
            let wait = [];
            voice.tickables.forEach(tickable => {
                if (tickable.noteType === 'n') {
                    track.addEvent(new NoteEvent({
                        pitch: tickable.keys.map((pitch, index) => this.convertPitch(pitch, index, tickable, options.addRenderedAccidentals)),
                        duration: this.convertDuration(tickable),
                        wait
                    }));
                    // reset wait
                    wait = [];
                }
                else if (tickable.noteType === 'r') {
                    // move on to the next tickable and add this to the stack
                    // of the `wait` property for the next note event
                    wait.push(this.convertDuration(tickable));
                }
            });
            // There may be outstanding rests at the end of the track,
            // pad with a ghost note (zero duration and velocity), just to capture the wait.
            if (wait.length > 0) {
                track.addEvent(new NoteEvent({ pitch: '[c4]', duration: '0', wait, velocity: '0' }));
            }
            return track;
        }
        /**
         * Converts VexFlow pitch syntax to MidiWriterJS syntax
         * @param pitch string
         * @param index pitch index
         * @param note struct from Vexflow
         * @param addRenderedAccidentals adds Vexflow rendered accidentals
         */
        convertPitch(pitch, index, note, addRenderedAccidentals = false) {
            var _a;
            // Splits note name from octave
            const pitchParts = pitch.split('/');
            // Retrieves accidentals from pitch
            // Removes natural accidentals since they are not accepted in Tonal Midi
            let accidentals = pitchParts[0].substring(1).replace('n', '');
            if (addRenderedAccidentals) {
                (_a = note.getAccidentals()) === null || _a === void 0 ? void 0 : _a.forEach(accidental => {
                    if (accidental.index === index) {
                        if (accidental.type === 'n') {
                            accidentals = '';
                        }
                        else {
                            accidentals += accidental.type;
                        }
                    }
                });
            }
            return pitchParts[0][0] + accidentals + pitchParts[1];
        }
        /**
         * Converts VexFlow duration syntax to MidiWriterJS syntax
         * @param note struct from VexFlow
         */
        convertDuration(note) {
            return 'd'.repeat(note.dots) + this.convertBaseDuration(note.duration) + (note.tuplet ? 't' + note.tuplet.num_notes : '');
        }
        /**
         * Converts VexFlow base duration syntax to MidiWriterJS syntax
         * @param duration Vexflow duration
         * @returns MidiWriterJS duration
         */
        convertBaseDuration(duration) {
            switch (duration) {
                case 'w':
                    return '1';
                case 'h':
                    return '2';
                case 'q':
                    return '4';
                default:
                    return duration;
            }
        }
    }

    /**
     * Object representation of a header chunk section of a MIDI file.
     * @param {number} numberOfTracks - Number of tracks
     * @return {Header}
     */
    class Header {
        constructor(numberOfTracks) {
            this.type = Constants.HEADER_CHUNK_TYPE;
            const trackType = numberOfTracks > 1 ? Constants.HEADER_CHUNK_FORMAT1 : Constants.HEADER_CHUNK_FORMAT0;
            this.data = trackType.concat(Utils.numberToBytes(numberOfTracks, 2), // two bytes long,
            Constants.HEADER_CHUNK_DIVISION);
            this.size = [0, 0, 0, this.data.length];
        }
    }

    /**
     * Object that puts together tracks and provides methods for file output.
     * @param {array|Track} tracks - A single {Track} object or an array of {Track} objects.
     * @param {object} options - {middleC: 'C4'}
     * @return {Writer}
     */
    class Writer {
        constructor(tracks, options = {}) {
            // Ensure tracks is an array
            this.tracks = Utils.toArray(tracks);
            this.options = options;
        }
        /**
         * Builds array of data from chunkschunks.
         * @return {array}
         */
        buildData() {
            const data = [];
            data.push(new Header(this.tracks.length));
            // For each track add final end of track event and build data
            this.tracks.forEach((track) => {
                data.push(track.buildData(this.options));
            });
            return data;
        }
        /**
         * Builds the file into a Uint8Array
         * @return {Uint8Array}
         */
        buildFile() {
            let build = [];
            // Data consists of chunks which consists of data
            this.buildData().forEach((d) => build = build.concat(d.type, d.size, d.data));
            return new Uint8Array(build);
        }
        /**
         * Convert file buffer to a base64 string.  Different methods depending on if browser or node.
         * @return {string}
         */
        base64() {
            if (typeof btoa === 'function') {
                let binary = '';
                const bytes = this.buildFile();
                const len = bytes.byteLength;
                for (let i = 0; i < len; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                return btoa(binary);
            }
            return Buffer.from(this.buildFile()).toString('base64');
        }
        /**
         * Get the data URI.
         * @return {string}
         */
        dataUri() {
            return 'data:audio/midi;base64,' + this.base64();
        }
        /**
         * Set option on instantiated Writer.
         * @param {string} key
         * @param {any} value
         * @return {Writer}
         */
        setOption(key, value) {
            this.options[key] = value;
            return this;
        }
        /**
         * Output to stdout
         * @return {string}
         */
        stdout() {
            return process.stdout.write(Buffer.from(this.buildFile()));
        }
    }

    var main = {
        Constants,
        ControllerChangeEvent,
        CopyrightEvent,
        CuePointEvent,
        EndTrackEvent,
        InstrumentNameEvent,
        KeySignatureEvent,
        LyricEvent,
        MarkerEvent,
        NoteOnEvent,
        NoteOffEvent,
        NoteEvent,
        PitchBendEvent,
        ProgramChangeEvent,
        TempoEvent,
        TextEvent,
        TimeSignatureEvent,
        Track,
        TrackNameEvent,
        Utils,
        VexFlow,
        Writer
    };

    return main;

})();
