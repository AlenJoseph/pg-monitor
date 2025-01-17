const themes = require('./themes');

let cct = themes.dimmed; // current/default color theme;

// monitor state;
const $state = {};

// supported events;
const $events = ['connect', 'disconnect', 'query', 'error', 'task', 'transact'];

const hasOwnProperty = (obj, propName) => Object.prototype.hasOwnProperty.call(obj, propName);

const monitor = {

    ///////////////////////////////////////////////
    // 'connect' event handler;
    // parameters:
    // - client - the only parameter for the event;
    // - detailed - optional, indicates that user@database is to be reported;
    connect(client, dc, useCount, detailed) {
        const event = 'connect';
        const cp = client ? client.connectionParameters : null;
        if (!cp) {
            throw new TypeError(errors.redirectParams(event));
        }
        const d = (detailed === undefined) ? monitor.detailed : !!detailed;
        if (d) {
            const countInfo = typeof useCount === 'number' ? cct.cn('; useCount: ') + cct.value(useCount) : '';
            print(null, event, cct.cn('connect(') + cct.value(cp.user + '@' + cp.database) + cct.cn(')') + countInfo);
        } else {
            print(null, event, cct.cn('connect'));
        }
    },

    ///////////////////////////////////////////////
    // 'connect' event handler;
    // parameters:
    // - client - the only parameter for the event;
    // - detailed - optional, indicates that user@database is to be reported;
    disconnect(client, dc, detailed) {
        const event = 'disconnect';
        const cp = client ? client.connectionParameters : null;
        if (!cp) {
            throw new TypeError(errors.redirectParams(event));
        }
        const d = (detailed === undefined) ? monitor.detailed : !!detailed;
        if (d) {
            // report user@database details;
            print(null, event, cct.cn('disconnect(') + cct.value(cp.user + '@' + cp.database) + cct.cn(')'));
        } else {
            print(null, event, cct.cn('disconnect'));
        }
    },

    ///////////////////////////////////////////////
    // 'query' event handler;
    // parameters:
    // - e - the only parameter for the event;
    // - detailed - optional, indicates that both task and transaction context are to be reported;
    query(e, detailed) {
        const event = 'query';
        if (!e || !('query' in e)) {
            throw new TypeError(errors.redirectParams(event));
        }
        let q = e.query;
        let special, prepared;
        if (typeof q === 'string') {
            const qSmall = q.toLowerCase();
            const verbs = ['begin', 'commit', 'rollback', 'savepoint', 'release'];
            for (let i = 0; i < verbs.length; i++) {
                if (qSmall.indexOf(verbs[i]) === 0) {
                    special = true;
                    break;
                }
            }
        } else {
            if (typeof q === 'object' && ('name' in q || 'text' in q)) {
                // Either a Prepared Statement or a Parameterized Query;
                prepared = true;
                const msg = [];
                if ('name' in q) {
                    msg.push(cct.query('name=') + '"' + cct.value(q.name) + '"');
                }
                if ('text' in q) {
                    msg.push(cct.query('text=') + '"' + cct.value(q.text) + '"');
                }
                if (Array.isArray(q.values) && q.values.length) {
                    msg.push(cct.query('values=') + cct.value(toJson(q.values)));
                }
                q = msg.join(', ');
            }
        }
        let qText = q;
        if (!prepared) {
            qText = special ? cct.special(q) : cct.query(q);
        }
        const d = (detailed === undefined) ? monitor.detailed : !!detailed;
        if (d && e.ctx) {
            // task/transaction details are to be reported;
            const sTag = getTagName(e), prefix = e.ctx.isTX ? 'tx' : 'task';
            if (sTag) {
                qText = cct.tx(prefix + '(') + cct.value(sTag) + cct.tx('): ') + qText;
            } else {
                qText = cct.tx(prefix + ': ') + qText;
            }
        }
        print(e, event, qText);
        if (e.params) {
            let p = e.params;
            if (typeof p !== 'string') {
                p = toJson(p);
            }
            print(e, event, timeGap + cct.paramTitle('params: ') + cct.value(p), true);
        }
    },

    ///////////////////////////////////////////////
    // 'task' event handler;
    // parameters:
    // - e - the only parameter for the event;
    task(e) {
        const event = 'task';
        if (!e || !e.ctx) {
            throw new TypeError(errors.redirectParams(event));
        }
        let msg = cct.tx('task');
        const sTag = getTagName(e);
        if (sTag) {
            msg += cct.tx('(') + cct.value(sTag) + cct.tx(')');
        }
        if (e.ctx.finish) {
            msg += cct.tx('/end');
        } else {
            msg += cct.tx('/start');
        }
        if (e.ctx.finish) {
            const duration = formatDuration(e.ctx.finish - e.ctx.start);
            msg += cct.tx('; duration: ') + cct.value(duration) + cct.tx(', success: ') + cct.value(!!e.ctx.success);
        }
        print(e, event, msg);
    },

    ///////////////////////////////////////////////
    // 'transact' event handler;
    // parameters:
    // - e - the only parameter for the event;
    transact(e) {
        const event = 'transact';
        if (!e || !e.ctx) {
            throw new TypeError(errors.redirectParams(event));
        }
        let msg = cct.tx('tx');
        const sTag = getTagName(e);
        if (sTag) {
            msg += cct.tx('(') + cct.value(sTag) + cct.tx(')');
        }
        if (e.ctx.finish) {
            msg += cct.tx('/end');
        } else {
            msg += cct.tx('/start');
        }
        if (e.ctx.finish) {
            const duration = formatDuration(e.ctx.finish - e.ctx.start);
            msg += cct.tx('; duration: ') + cct.value(duration) + cct.tx(', success: ') + cct.value(!!e.ctx.success);
        }
        print(e, event, msg);
    },

    ///////////////////////////////////////////////
    // 'error' event handler;
    // parameters:
    // - err - error-text parameter for the original event;
    // - e - error context object for the original event;
    // - detailed - optional, indicates that transaction context is to be reported;
    error(err, e, detailed) {
        const event = 'error';
        const errMsg = err ? (err.message || err) : null;
        if (!e || typeof e !== 'object') {
            throw new TypeError(errors.redirectParams(event));
        }
        print(e, event, cct.errorTitle('error: ') + cct.error(errMsg));
        let q = e.query;
        if (q !== undefined && typeof q !== 'string') {
            if (typeof q === 'object' && ('name' in q || 'text' in q)) {
                const tmp = {};
                const names = ['name', 'text', 'values'];
                names.forEach(n => {
                    if (n in q) {
                        tmp[n] = q[n];
                    }
                });
                q = tmp;
            }
            q = toJson(q);
        }
        if (e.cn) {
            // a connection issue;
            print(e, event, timeGap + cct.paramTitle('connection: ') + cct.value(toJson(e.cn)), true);
        } else {
            if (q !== undefined) {
                const d = (detailed === undefined) ? monitor.detailed : !!detailed;
                if (d && e.ctx) {
                    // transaction details are to be reported;
                    const sTag = getTagName(e), prefix = e.ctx.isTX ? 'tx' : 'task';
                    if (sTag) {
                        print(e, event, timeGap + cct.paramTitle(prefix + '(') + cct.value(sTag) + cct.paramTitle('): ') + cct.value(q), true);
                    } else {
                        print(e, event, timeGap + cct.paramTitle(prefix + ': ') + cct.value(q), true);
                    }
                } else {
                    print(e, event, timeGap + cct.paramTitle('query: ') + cct.value(q), true);
                }
            }
        }
        if (e.params) {
            print(e, event, timeGap + cct.paramTitle('params: ') + cct.value(toJson(e.params)), true);
        }
    },

    /////////////////////////////////////////////////////////
    // attaches to pg-promise initialization options object:
    // - options - the options object;
    // - events - optional, list of events to attach to;
    // - override - optional, overrides the existing event handlers;
    attach(options, events, override) {

        if (options && options.options && typeof options.options === 'object') {
            events = options.events;
            override = options.override;
            options = options.options;
        }

        if ($state.options) {
            throw new Error('Repeated attachments not supported, must call detach first.');
        }

        if (!options || typeof options !== 'object') {
            throw new TypeError('Initialization object \'options\' must be specified.');
        }

        const hasFilter = Array.isArray(events);

        if (!isNull(events) && !hasFilter) {
            throw new TypeError('Invalid parameter \'events\' passed.');
        }

        $state.options = options;

        const self = monitor;

        // attaching to 'connect' event:
        if (!hasFilter || events.indexOf('connect') !== -1) {
            $state.connect = {
                value: options.connect,
                exists: 'connect' in options
            };
            if (typeof options.connect === 'function' && !override) {
                options.connect = function (client, dc, useCount) {
                    $state.connect.value(client, dc, useCount); // call the original handler;
                    self.connect(client, dc, useCount);
                };
            } else {
                options.connect = self.connect;
            }
        }

        // attaching to 'disconnect' event:
        if (!hasFilter || events.indexOf('disconnect') !== -1) {
            $state.disconnect = {
                value: options.disconnect,
                exists: 'disconnect' in options
            };
            if (typeof options.disconnect === 'function' && !override) {
                options.disconnect = function (client, dc) {
                    $state.disconnect.value(client, dc); // call the original handler;
                    self.disconnect(client, dc);
                };
            } else {
                options.disconnect = self.disconnect;
            }
        }

        // attaching to 'query' event:
        if (!hasFilter || events.indexOf('query') !== -1) {
            $state.query = {
                value: options.query,
                exists: 'query' in options
            };
            if (typeof options.query === 'function' && !override) {
                options.query = function (e) {
                    $state.query.value(e); // call the original handler;
                    self.query(e);
                };
            } else {
                options.query = self.query;
            }
        }

        // attaching to 'task' event:
        if (!hasFilter || events.indexOf('task') !== -1) {
            $state.task = {
                value: options.task,
                exists: 'task' in options
            };
            if (typeof options.task === 'function' && !override) {
                options.task = function (e) {
                    $state.task.value(e); // call the original handler;
                    self.task(e);
                };
            } else {
                options.task = self.task;
            }
        }

        // attaching to 'transact' event:
        if (!hasFilter || events.indexOf('transact') !== -1) {
            $state.transact = {
                value: options.transact,
                exists: 'transact' in options
            };
            if (typeof options.transact === 'function' && !override) {
                options.transact = function (e) {
                    $state.transact.value(e); // call the original handler;
                    self.transact(e);
                };
            } else {
                options.transact = self.transact;
            }
        }

        // attaching to 'error' event:
        if (!hasFilter || events.indexOf('error') !== -1) {
            $state.error = {
                value: options.error,
                exists: 'error' in options
            };
            if (typeof options.error === 'function' && !override) {
                options.error = function (err, e) {
                    $state.error.value(err, e); // call the original handler;
                    self.error(err, e);
                };
            } else {
                options.error = self.error;
            }
        }
    },

    isAttached() {
        return !!$state.options;
    },

    /////////////////////////////////////////////////////////
    // detaches from all events to which was attached during
    // the last `attach` call.
    detach() {
        if (!$state.options) {
            throw new Error('Event monitor not attached.');
        }
        $events.forEach(e => {
            if (e in $state) {
                if ($state[e].exists) {
                    $state.options[e] = $state[e].value;
                } else {
                    delete $state.options[e];
                }
                delete $state[e];
            }
        });
        $state.options = null;
    },

    //////////////////////////////////////////////////////////////////
    // sets a new theme either by its name (from the predefined ones),
    // or as a new object with all colors specified.
    setTheme(t) {
        const err = 'Invalid theme parameter specified.';
        if (!t) {
            throw new TypeError(err);
        }
        if (typeof t === 'string') {
            if (t in themes) {
                cct = themes[t];
            } else {
                throw new TypeError('Theme \'' + t + '\' does not exist.');
            }
        } else {
            if (typeof t === 'object') {
                for (const p in themes.monochrome) {
                    if (!hasOwnProperty(t, p)) {
                        throw new TypeError('Invalid theme: property \'' + p + '\' is missing.');
                    }
                    if (typeof t[p] !== 'function') {
                        throw new TypeError('Theme property \'' + p + '\' is invalid.');
                    }
                }
                cct = t;
            } else {
                throw new Error(err);
            }
        }
    },

    ////////////////////////////////////////////////////
    // global 'detailed' flag override, to report all
    // of the optional details that are supported;
    detailed: true,

    //////////////////////////////////////////////////////////////////
    // sets a new value to the detailed var. This function is needed
    // to support the value attribution in Typescript.
    setDetailed(value) {
        this.detailed = !!value;
    },

    //////////////////////////////////////////////////////////////////
    // sets a custom log function to support the function attribution
    // in Typescript.
    setLog(log) {
        module.exports.log = typeof log === 'function' ? log : null;
    }
};

// prints the text on screen, optionally
// notifying the client of the log events;
function print(e, event, text, isExtraLine) {
    let t = null, s = text;
    if (!isExtraLine) {
        t = new Date();
        s = cct.time(formatTime(t)) + ' ' + text;
    }
    let display = true;
    const log = module.exports.log;
    if (typeof log === 'function') {
        // the client expects log notifications;
        const info = {
            event,
            time: t,
            colorText: text.trim(),
            text: removeColors(text).trim()
        };
        if (e && e.ctx) {
            info.ctx = e.ctx;
        }
        log(removeColors(s), info);
        display = info.display === undefined || !!info.display;
    }
    // istanbul ignore next: cannot test the next
    // block without writing things into the console;
    if (display) {
        if (!process.stdout.isTTY) {
            s = removeColors(s);
        }
        // eslint-disable-next-line
        console.log(s);
    }
}

// formats time as '00:00:00';
function formatTime(t) {
    return padZeros(t.getHours(), 2) + ':' + padZeros(t.getMinutes(), 2) + ':' + padZeros(t.getSeconds(), 2);
}

// formats duration value (in milliseconds) as '00:00:00.000',
// shortened to just the values that are applicable.
function formatDuration(d) {
    const hours = Math.floor(d / 3600000);
    const minutes = Math.floor((d - hours * 3600000) / 60000);
    const seconds = Math.floor((d - hours * 3600000 - minutes * 60000) / 1000);
    const ms = d - hours * 3600000 - minutes * 60000 - seconds * 1000;
    let s = '.' + padZeros(ms, 3); // milliseconds are shown always;
    if (d >= 1000) {
        // seconds are to be shown;
        s = padZeros(seconds, 2) + s;
        if (d >= 60000) {
            // minutes are to be shown;
            s = padZeros(minutes, 2) + ':' + s;
            if (d >= 3600000) {
                // hours are to be shown;
                s = padZeros(hours, 2) + ':' + s;
            }
        }
    }
    return s;
}

// removes color elements from the text;
function removeColors(text) {
    /*eslint no-control-regex: 0*/
    return text.replace(/\x1B\[([0-9]{1,2}(;[0-9]{1,2})?)?[m|K]/g, '');
}

function padZeros(value, n) {
    let str = value.toString();
    while (str.length < n)
        str = '0' + str;
    return str;
}

// extracts tag name from a tag object/value;
function getTagName(event) {
    let sTag;
    const tag = event.ctx.tag;
    if (tag) {
        switch (typeof tag) {
            case 'string':
                sTag = tag;
                break;
            case 'number':
                if (Number.isFinite(tag)) {
                    sTag = tag.toString();
                }
                break;
            case 'object':
                // A tag-object must have its own method toString(), in order to be converted automatically;
                if (hasOwnProperty(tag, 'toString') && typeof tag.toString === 'function') {
                    sTag = tag.toString();
                }
                break;
            default:
                break;
        }
    }
    return sTag;
}

////////////////////////////////////////////
// Simpler check for null/undefined;
function isNull(value) {
    return value === null || value === undefined;
}

///////////////////////////////////////////////////////////////
// Adds support for BigInt, to be rendered like in JavaScript,
// as an open value, with 'n' in the end.
function toJson(data) {
    if (data !== undefined) {
        return JSON.stringify(data, (_, v) => typeof v === 'bigint' ? `${v}#bigint` : v)
            .replace(/"(-?\d+)#bigint"/g, (_, a) => a + 'n');
    }
}

// reusable error messages;
const errors = {
    redirectParams(event) {
        return 'Invalid event \'' + event + '\' redirect parameters.';
    }
};

// 9 spaces for the time offset:
const timeGap = ' '.repeat(9);

module.exports = monitor;
