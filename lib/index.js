'use strict';

var themes = require("./themes");

var cct = themes.dimmed; // current/default color theme;

var monitor = {

    // 'connect' event handler;
    // parameters:
    // - client - the only parameter for the event;
    // - detailed - optional, indicates that user@database are to be reported;
    connect: function (client, detailed) {
        var cp = client ? client.connectionParameters : null;
        if (!cp) {
            throw new Error(errors.redirectParams('connect'));
        }
        if (monitor.detailed || detailed) {
            // report user@database details;
            print(cct.cn("connect(") + cct.value(cp.user + "@" + cp.database) + cct.cn(")"));
        } else {
            print(cct.cn("connect"));
        }
    },

    // 'connect' event handler;
    // parameters:
    // - client - the only parameter for the event;
    // - detailed - optional, indicates that user@database are to be reported;
    disconnect: function (client, detailed) {
        var cp = client ? client.connectionParameters : null;
        if (!cp) {
            throw new Error(errors.redirectParams('disconnect'));
        }
        if (monitor.detailed || detailed) {
            // report user@database details;
            print(cct.cn("disconnect(") + cct.value(cp.user + "@" + cp.database) + cct.cn(")"));
        } else {
            print(cct.cn("disconnect"));
        }
    },

    // 'query' event handler;
    // parameters:
    // - e - the only parameter for the event;
    // - detailed - optional, indicates that transaction context is to be reported;
    query: function (e, detailed) {
        if (!e || !('query' in e)) {
            throw new Error(errors.redirectParams('query'));
        }
        var q = e.query;
        var special, verbs = ['begin', 'commit', 'rollback'];
        for (var i = 0; i < verbs.length; i++) {
            if (q.indexOf(verbs[i]) === 0) {
                special = true;
                break;
            }
        }
        var qText = special ? cct.special(q) : cct.query(q);
        if ((monitor.detailed || detailed) && e.ctx) {
            // transaction details are to be reported;
            var sTag = getTagName(e);
            if (sTag) {
                qText = cct.tx("tx(") + cct.value(sTag) + cct.tx("): ") + qText;
            } else {
                qText = cct.tx("tx: ") + qText;
            }
        }
        print(qText);
        if (e.params) {
            var p = e.params;
            if (typeof(p) !== 'string') {
                p = JSON.stringify(p);
            }
            print(cct.paramTitle("params: ") + cct.value(p), true);
        }
    },

    // 'transact' event handler;
    // parameters:
    // - e - the only parameter for the event;
    transact: function (e) {
        if (!e || !e.ctx) {
            throw new Error(errors.redirectParams('transact'));
        }
        var msg = cct.tx("tx");
        var sTag = getTagName(e);
        if (sTag) {
            msg += cct.tx("(") + cct.value(sTag) + cct.tx(")");
        }
        if (e.ctx.finish) {
            msg += cct.tx("/end");
        } else {
            msg += cct.tx("/start");
        }
        if (e.ctx.finish) {
            var duration = formatDuration(e.ctx.finish - e.ctx.start);
            msg += cct.tx("; duration: ") + cct.value(duration) + cct.tx(", success: ") + cct.value(e.ctx.success);
        }
        print(msg);
    },

    // 'error' event handler;
    // parameters:
    // - err - error-text parameter for the original event;
    // - e - error context object for the original event;
    // - detailed - optional, indicates that transaction context is to be reported;
    error: function (err, e, detailed) {
        if (typeof(err) !== 'string' || !e || typeof(e) !== 'object') {
            throw new Error(errors.redirectParams('error'));
        }
        print(cct.errorTitle("error: ") + cct.error(err));
        var q = e.query;
        if (typeof(q) !== 'string') {
            q = JSON.stringify(q);
        }
        if (e.ctx && (monitor.detailed || detailed)) {
            // transaction details are to be reported;
            var sTag = getTagName(e);
            if (sTag) {
                print(timeGap + cct.paramTitle("tx(") + cct.value(sTag) + cct.paramTitle("): ") + cct.value(q), true);
            } else {
                print(timeGap + cct.paramTitle("tx: ") + cct.value(q), true);
            }
        } else {
            print(timeGap + cct.paramTitle("query: ") + cct.value(q), true);
        }
        if (e.params) {
            print(timeGap + cct.paramTitle("params: ") + cct.value(JSON.stringify(e.params)), true);
        }
    },

    // attaches to pg-promise initialization options object:
    // - options - the options object;
    // - events - optional, list of events to attach to;
    // - override - optional, overrides the existing event handlers;
    attach: function (options, events, override) {

        if (typeof(options) !== 'object') {
            throw new Error("Initialization object 'options' must be specified.");
        }

        var hasFilter = Array.isArray(events);

        if (events && !hasFilter) {
            throw new Error("Invalid parameter 'events' passed.");
        }

        var self = this;

        // attaching to 'connect' event:
        if (!hasFilter || events.indexOf('connect') !== -1) {
            if (typeof(options.connect) === 'function' && !override) {
                var cn = options.connect;
                options.connect = function (client) {
                    cn(client); // call the original handler;
                    self.connect(client);
                };
            } else {
                options.connect = self.connect;
            }
        }

        // attaching to 'disconnect' event:
        if (!hasFilter || events.indexOf('disconnect') !== -1) {
            if (typeof(options.disconnect) === 'function' && !override) {
                var dis = options.disconnect;
                options.disconnect = function (client) {
                    dis(client); // call the original handler;
                    self.disconnect(client);
                };
            } else {
                options.disconnect = self.disconnect;
            }
        }

        // attaching to 'query' event:
        if (!hasFilter || events.indexOf('query') !== -1) {
            if (typeof(options.query) === 'function' && !override) {
                var q = options.query;
                options.query = function (e) {
                    q(e); // call the original handler;
                    self.query(e);
                };
            } else {
                options.query = self.query;
            }
        }

        // attaching to 'transact' event:
        if (!hasFilter || events.indexOf('transact') !== -1) {
            if (typeof(options.transact) === 'function' && !override) {
                var tx = options.transact;
                options.transact = function (e) {
                    tx(e); // call the original handler;
                    self.transact(e);
                };
            } else {
                options.transact = self.transact;
            }
        }

        // attaching to 'error' event:
        if (!hasFilter || events.indexOf('error') !== -1) {
            if (typeof(options.error) === 'function' && !override) {
                var er = options.error;
                options.error = function (err, e) {
                    er(err, e); // call the original handler;
                    self.error(err, e);
                };
            } else {
                options.error = self.error;
            }
        }
    },

    // sets a new theme either by name, from the predefined ones,
    // or as a new palette object.
    setTheme: function (t) {
        var err = "Invalid theme parameter specified.";
        if (!t) {
            throw new Error(err);
        }
        if (typeof(t) === 'string') {
            if (t in themes) {
                cct = themes[t];
            } else {
                throw new Error("Theme '" + t + "' doesn't exist.");
            }
        } else {
            if (typeof(t) === 'object') {
                if (typeof(t) === 'object') {
                    for (var p in themes.monochrome) {
                        if (!t.hasOwnProperty(p)) {
                            throw new Error("Invalid theme: property '" + p + "' is missing.");
                        }
                        if (typeof(t[p]) !== 'function') {
                            throw new Error("Theme property '" + p + "' is invalid.");
                        }
                    }
                    cct = t;
                }
            } else {
                throw new Error(err);
            }
        }
    },

    // global 'detailed' flag override, to report all
    // of the optional details that are supported;
    detailed: true
};

// prints the text on screen, optionally
// notifying the client of the log events;
function print(text, isExtraLine) {
    var t, s = text;
    if (!isExtraLine) {
        t = new Date();
        s = cct.time(formatTime(t)) + ' ' + text;
    }
    console.log(s);
    var log = module.exports.log;
    if (typeof(log) === 'function') {
        // the client expects log notifications;
        log(removeColors(s), {
            time: t,
            text: removeColors(text)
        });
    }
}

// formats time as '00:00:00';
function formatTime(t) {
    return t.getHours().padZeros(2) + ':' + t.getMinutes().padZeros(2) + ':' + t.getSeconds().padZeros(2);
}

// formats duration value (in milliseconds) as '00:00:00.000',
// shortened to just the values that are applicable.
function formatDuration(d) {
    var hours = Math.floor(d / 3600000);
    var minutes = Math.floor((d - hours * 3600000) / 60000);
    var seconds = Math.floor((d - hours * 3600000 - minutes * 60000) / 1000);
    var ms = d - hours * 3600000 - minutes * 60000 - seconds * 1000;
    var s = "." + ms.padZeros(3); // milliseconds are shown always;
    if (d >= 1000) {
        // seconds are to be shown;
        s = seconds.padZeros(2) + s;
        if (d >= 60000) {
            // minutes are to be shown;
            s = minutes.padZeros(2) + ':' + s;
            if (d >= 3600000) {
                // hours are to be shown;
                s = hours.padZeros(2) + ':' + s;
            }
        }
    }
    return s;
}

// removes color elements from the text;
function removeColors(text) {
    return text.replace(/\x1B\[([0-9]{1,2}(;[0-9]{1,2})?)?[m|K]/g, '');
}

// pads numbers with zeroes;
if (!Number.prototype.padZeros) {
    Number.prototype.padZeros = function (n) {
        var str = this.toString();
        while (str.length < n)
            str = '0' + str;
        return str;
    };
}

// extracts tag name from a tag object/value;
function getTagName(event) {
    var sTag, tag = event.ctx.tag;
    if (tag) {
        if (typeof(tag) === 'string') {
            sTag = tag;
        } else {
            // if the tag is an object, it must have its own method toString(),
            // in order to be converted automatically;
            if (typeof(tag) === 'object' && tag.hasOwnProperty('toString') && typeof(tag.toString) === 'function') {
                sTag = tag.toString();
            }
        }
    }
    return sTag;
}

// reusable error messages;
var errors = {
    redirectParams: function (event) {
        return "Invalid event '" + event + "' redirect parameters.";
    }
};

// 9 spaces for time offset;
var timeGap = '         ';

module.exports = monitor;