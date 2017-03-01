var CoffeeLint = require("coffeelint").lint;
var StripJSONComments = require("strip-json-comments");
var LoaderUtils = require("loader-utils");
var TextTable = require("text-table");
var Chalk = require("chalk");
var FS = require("fs");

// TODO: Clean up this function to make it more readable.
function process(webpack, input, options) {
    var data = CoffeeLint(input, options);
    var reporter = options.reporter;
    var quiet = options.quiet;
    var warnings = 0;
    var errors = 0;

    // Validation issues have occurred.
    if (data.length) {
        if (reporter) { return reporter(data); }
        
        var rows = [];
        
        // Build up an array of rows to be rendered in the table.
        data.forEach(function(issue) {
            var error = (issue.level == "error");
            var level = error ? Chalk.red(issue.level) : Chalk.yellow(issue.level);
            var context = Chalk.white.bold(issue.context || issue.message);

            // If the quite option is set and it's a warning we ignore the issue.
            if (!quiet || error) {
                if (error) { errors++; } else { warnings++; }
                rows.push(["", Chalk.gray(issue.lineNumber), level, context, Chalk.gray(issue.rule)]);
            }
        });

        var color = errors ? "red" : "yellow";

        // file path.
        var path = Chalk.underline[color](webpack.resourcePath) + "\n";

        // Build a formatted table of the lint issues. Very much inspired by Webpack's stylish formatter.
        var table = TextTable(rows, {align: ["", "r", "l", "l"]}) + "\n";

        var total = warnings + errors;
        var summary = [
            "\u2716 ", total, pluralize(" problem", total),
            " (", errors, pluralize(" error", errors), ", ",
            warnings, pluralize(" warning", warnings), ")"
        ].join("");

        var output = ("\n" + path + table + "\n" + Chalk[color].bold(summary));
        
        if (errors) {
            webpack.emitError(output);
        } else {
            webpack.emitWarning(output);
        }
    }
}

function merge(options, query) {
    var opts = {};
    var q = LoaderUtils.parseQuery(query);
    
    // Shallow clone options object.
    if (options.coffeelint) {
        for (var name in options.coffeelint) {
            opts[name] = options.coffeelint[name];
        }
    }

    // Merge query with options
    for (var name in query) {
        opts[name] = query[name];
    }
    
    return opts;
}

function loadConfig(webpack, options, callback) {
    var path = options.configFile || './coffeelint.json';

    if (!path) { return callback ? callback() : null; }

    if (callback) {
        // Asynchronously.
        FS.exists(path, function(exists) {
            if (!exists) { return callback(); }

            // Let Webpack know about the config file.
            webpack.addDependency(path);

            // Read file and strip comments.
            FS.readFile(path, "utf8", function(err, contents) {
                if (err) { return callback(err); }

                try {
                    var config = StripJSONComments(contents);
                    callback(null, JSON.parse(config));
                } catch(e) {
                    callback(e);
                }
	    });
        });
    } else {
        if (!FS.existsSync(path)) {
	    // External config not found.
	    return;
	}

        // Let Webpack know about the config file.
        webpack.addDependency(path);

        try {
            // Read file and strip comments.
            var config = StripJSONComments(FS.readFileSync(path, "utf8"));
            return JSON.parse(config);
        } catch (e) {
            throw (e);
        }
    }
}

function extend(a, b) {
    for (var name in b) {
        a[name] = b[name];
    }
    
    return a;
};

function pluralize(word, count) {
    return (count === 1 ? word : word + "s");
}

module.exports = function(input) {
    var callback = this.async();
    var options = merge(this.options, this.query);
    var webpack = this;
    
    this.cacheable && this.cacheable();
    
    if (!callback) {
	// Load config synchronously.
        var config = loadConfig(webpack, options);

	process(webpack, input, extend(options, config));
	return input;
    }

    // Load config asynchronously.
    loadConfig(webpack, options, function(err, config) {
	if (err) { return callback(err); }

	try {
	    process(webpack, input, extend(options, config));
            callback(null, input);
	} catch(e) {
	    return callback(e);
	}
    });
};
