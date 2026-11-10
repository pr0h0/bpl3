# Prometheus metrics: counters, gauges and histograms rendered in the text
# exposition format (version 0.0.4).

import [Array] from "std/array.bpl";
import [String] from "std/string.bpl";
import [StringBuilder] from "std/string_builder.bpl";
import [Time] from "std/time.bpl";

extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;
extern strlen(text: string) ret long;
extern strcmp(a: string, b: string) ret int;
extern snprintf(buffer: string, size: ulong, format: string, ...) ret int;
extern strtod(text: string, end: *string) ret double;

export [Registry];
export [MetricFamily];
export [MetricKind];
export [Series];

enum MetricKind {
    Counter,
    Gauge,
    Histogram,
}

frame metricsCopy(text: string) ret string {
    local length: long = strlen(text);
    local copy: string = cast<string>(malloc(length + 1));
    if (copy == nullptr) {
        throw "Metrics allocation failed";
    }
    loop (local i: long = 0; i <= length; i = i + 1) {
        copy[i] = text[i];
    }
    return copy;
}

frame metricsNameChar(c: char, first: bool, allowColon: bool) ret bool {
    if (((c >= 'a') && (c <= 'z')) || ((c >= 'A') && (c <= 'Z')) || (c == '_')) {
        return true;
    }
    if (allowColon && (c == ':')) {
        return true;
    }
    return !first && (c >= '0') && (c <= '9');
}

frame metricsValidName(name: string, allowColon: bool) ret bool {
    if ((name == nullptr) || (name[0] == 0)) {
        return false;
    }
    loop (local i: int = 0; name[i] != 0; i = i + 1) {
        if (!metricsNameChar(name[i], i == 0, allowColon)) {
            return false;
        }
    }
    return true;
}

frame metricsNumber(out: *StringBuilder, value: double) {
    if (value != value) {
        out.append("NaN");
        return;
    }
    if ((value - value) != 0.0) {
        if (value > 0.0) {
            out.append("+Inf");
        } else {
            out.append("-Inf");
        }
        return;
    }
    local buffer: char[40];
    local text: string = cast<string>(&buffer[0]);
    snprintf(text, 40, "%.15g", value);
    if (strtod(text, cast<*string>(nullptr)) != value) {
        snprintf(text, 40, "%.17g", value);
    }
    out.append(text);
}

# One labelled time series of a family.
struct Series {
    family: *MetricFamily,
    # Owned label values, parallel to the family's label names.
    values: Array<string>,
    value: double,
    # Histogram state: per-bucket (non-cumulative) counts, sum and count.
    buckets: Array<long>,
    sum: double,
    count: long,

    frame inc(this: *Series) {
        this.add(1.0);
    }
    frame add(this: *Series, amount: double) {
        if (this.family.kind == MetricKind.Histogram) {
            throw "Use observe() on a histogram";
        }
        if ((this.family.kind == MetricKind.Counter) && !(amount >= 0.0)) {
            throw "Counters can only increase";
        }
        this.value = this.value + amount;
    }
    frame dec(this: *Series) {
        this.sub(1.0);
    }
    frame sub(this: *Series, amount: double) {
        if (this.family.kind != MetricKind.Gauge) {
            throw "Only gauges can decrease";
        }
        this.value = this.value - amount;
    }
    frame set(this: *Series, value: double) {
        if (this.family.kind != MetricKind.Gauge) {
            throw "Only gauges can be set";
        }
        this.value = value;
    }
    frame observe(this: *Series, value: double) {
        if (this.family.kind != MetricKind.Histogram) {
            throw "Only histograms observe values";
        }
        if (value != value) {
            throw "Cannot observe NaN";
        }
        local bounds: *Array<double> = &this.family.bounds;
        local slot: int = bounds.len();
        loop (local i: int = 0; i < bounds.len(); i = i + 1) {
            if (value <= bounds.get(i)) {
                slot = i;
                break;
            }
        }
        this.buckets.set(slot, this.buckets.get(slot) + 1);
        this.sum = this.sum + value;
        this.count = this.count + 1;
    }
    # Observes the seconds elapsed since `startMs` (from Registry.now()).
    frame observeSince(this: *Series, startMs: long) {
        this.observe(cast<double>(Time.monotonicMs() - startMs) / 1000.0);
    }
    frame get(this: *Series) ret double {
        return this.value;
    }
}

struct MetricFamily {
    name: string,
    help: string,
    kind: MetricKind,
    # Owned label names.
    label_names: Array<string>,
    # Histogram upper bounds, strictly increasing (+Inf is implicit).
    bounds: Array<double>,
    series: Array<*Series>,

    frame find(this: *MetricFamily, values: *Array<string>) ret *Series {
        if (values.len() != this.label_names.len()) {
            throw "Wrong number of label values";
        }
        loop (local i: int = 0; i < this.series.len(); i = i + 1) {
            local candidate: *Series = this.series.get(i);
            local same: bool = true;
            loop (local j: int = 0; j < values.len(); j = j + 1) {
                if (strcmp(candidate.values.get(j), values.get(j)) != 0) {
                    same = false;
                    break;
                }
            }
            if (same) {
                return candidate;
            }
        }
        local created: *Series = cast<*Series>(malloc(sizeof<Series>()));
        if (created == nullptr) {
            throw "Metrics allocation failed";
        }
        local init: Series;
        init.family = this;
        init.values = Array<string>.new(values.len());
        loop (local j: int = 0; j < values.len(); j = j + 1) {
            local text: string = values.get(j);
            if (text == nullptr) {
                throw "Label values cannot be null";
            }
            init.values.push(metricsCopy(text));
        }
        init.value = 0.0;
        init.buckets = Array<long>.new(0);
        if (this.kind == MetricKind.Histogram) {
            loop (local b: int = 0; b <= this.bounds.len(); b = b + 1) {
                init.buckets.push(0);
            }
        }
        init.sum = 0.0;
        init.count = 0;
        *created = init;
        this.series.push(created);
        return created;
    }
    # The unlabelled series, or a labelled one by its values in label order.
    # Series are created on first use and live as long as the registry.
    frame labels(this: *MetricFamily) ret *Series {
        local values: Array<string> = Array<string>.new(0);
        local result: *Series = this.find(&values);
        values.destroy();
        return result;
    }
    frame labels(this: *MetricFamily, a: string) ret *Series {
        local values: Array<string> = Array<string>.new(1);
        values.push(a);
        local result: *Series = this.find(&values);
        values.destroy();
        return result;
    }
    frame labels(this: *MetricFamily, a: string, b: string) ret *Series {
        local values: Array<string> = Array<string>.new(2);
        values.push(a);
        values.push(b);
        local result: *Series = this.find(&values);
        values.destroy();
        return result;
    }
    frame labels(this: *MetricFamily, a: string, b: string, c: string) ret *Series {
        local values: Array<string> = Array<string>.new(3);
        values.push(a);
        values.push(b);
        values.push(c);
        local result: *Series = this.find(&values);
        values.destroy();
        return result;
    }
    frame labelsArray(this: *MetricFamily, values: *Array<string>) ret *Series {
        return this.find(values);
    }
    # Shortcuts for unlabelled families.
    frame inc(this: *MetricFamily) {
        this.labels().inc();
    }
    frame add(this: *MetricFamily, amount: double) {
        this.labels().add(amount);
    }
    frame set(this: *MetricFamily, value: double) {
        this.labels().set(value);
    }
    frame observe(this: *MetricFamily, value: double) {
        this.labels().observe(value);
    }

    frame escapeHelp(out: *StringBuilder, text: string) {
        loop (local i: int = 0; text[i] != 0; i = i + 1) {
            if (text[i] == '\\') {
                out.append("\\\\");
            } else if (text[i] == '\n') {
                out.append("\\n");
            } else {
                out.appendChar(text[i]);
            }
        }
    }
    frame escapeLabel(out: *StringBuilder, text: string) {
        loop (local i: int = 0; text[i] != 0; i = i + 1) {
            if (text[i] == '\\') {
                out.append("\\\\");
            } else if (text[i] == '"') {
                out.append("\\\"");
            } else if (text[i] == '\n') {
                out.append("\\n");
            } else {
                out.appendChar(text[i]);
            }
        }
    }
    # Writes `{a="x",b="y"}` (plus an optional le bucket label), or nothing
    # when there are no labels.
    frame writeLabels(this: *MetricFamily, out: *StringBuilder, series: *Series, le: string) {
        if ((this.label_names.len() == 0) && (le == nullptr)) {
            return;
        }
        out.appendChar('{');
        loop (local i: int = 0; i < this.label_names.len(); i = i + 1) {
            if (i > 0) {
                out.appendChar(',');
            }
            out.append(this.label_names.get(i));
            out.append("=\"");
            MetricFamily.escapeLabel(out, series.values.get(i));
            out.appendChar('"');
        }
        if (le != nullptr) {
            if (this.label_names.len() > 0) {
                out.appendChar(',');
            }
            out.append("le=\"");
            out.append(le);
            out.appendChar('"');
        }
        out.appendChar('}');
    }
    frame write(this: *MetricFamily, out: *StringBuilder) {
        out.append("# HELP ");
        out.append(this.name);
        out.appendChar(' ');
        MetricFamily.escapeHelp(out, this.help);
        out.append("\n# TYPE ");
        out.append(this.name);
        match (this.kind) {
            MetricKind.Counter => {
                out.append(" counter\n");
            },
            MetricKind.Gauge => {
                out.append(" gauge\n");
            },
            MetricKind.Histogram => {
                out.append(" histogram\n");
            },
        };
        loop (local i: int = 0; i < this.series.len(); i = i + 1) {
            local series: *Series = this.series.get(i);
            if (this.kind != MetricKind.Histogram) {
                out.append(this.name);
                this.writeLabels(out, series, nullptr);
                out.appendChar(' ');
                metricsNumber(out, series.value);
                out.appendChar('\n');
                continue;
            }
            local cumulative: long = 0;
            loop (local b: int = 0; b <= this.bounds.len(); b = b + 1) {
                cumulative = cumulative + series.buckets.get(b);
                local bound: StringBuilder = StringBuilder.new(16);
                if (b < this.bounds.len()) {
                    metricsNumber(&bound, this.bounds.get(b));
                } else {
                    bound.append("+Inf");
                }
                out.append(this.name);
                out.append("_bucket");
                this.writeLabels(out, series, bound.toString());
                bound.destroy();
                out.appendChar(' ');
                out.appendLong(cumulative);
                out.appendChar('\n');
            }
            out.append(this.name);
            out.append("_sum");
            this.writeLabels(out, series, nullptr);
            out.appendChar(' ');
            metricsNumber(out, series.sum);
            out.appendChar('\n');
            out.append(this.name);
            out.append("_count");
            this.writeLabels(out, series, nullptr);
            out.appendChar(' ');
            out.appendLong(series.count);
            out.appendChar('\n');
        }
    }
    frame destroy(this: *MetricFamily) {
        loop (local i: int = 0; i < this.series.len(); i = i + 1) {
            local series: *Series = this.series.get(i);
            loop (local j: int = 0; j < series.values.len(); j = j + 1) {
                free(series.values.get(j));
            }
            series.values.destroy();
            series.buckets.destroy();
            free(cast<*void>(series));
        }
        loop (local i: int = 0; i < this.label_names.len(); i = i + 1) {
            free(this.label_names.get(i));
        }
        this.series.destroy();
        this.label_names.destroy();
        this.bounds.destroy();
        free(this.name);
        free(this.help);
    }
}

struct Registry {
    families: Array<*MetricFamily>,

    frame new() ret Registry {
        local registry: Registry;
        registry.families = Array<*MetricFamily>.new(0);
        return registry;
    }
    # Content-Type for render() output.
    frame contentType() ret string {
        return "text/plain; version=0.0.4; charset=utf-8";
    }
    # Monotonic milliseconds, for Series.observeSince.
    frame now() ret long {
        return Time.monotonicMs();
    }
    frame get(this: *Registry, name: string) ret *MetricFamily {
        loop (local i: int = 0; i < this.families.len(); i = i + 1) {
            local family: *MetricFamily = this.families.get(i);
            if (strcmp(family.name, name) == 0) {
                return family;
            }
        }
        return nullptr;
    }
    # `labelNames` is a comma-separated list such as "method,status", or "".
    frame register(this: *Registry, kind: MetricKind, name: string, help: string, labelNames: string) ret *MetricFamily {
        if (!metricsValidName(name, true)) {
            throw "Invalid metric name";
        }
        if (help == nullptr) {
            throw "Metric help text is required";
        }
        if (this.get(name) != nullptr) {
            throw "Metric already registered";
        }
        local family: *MetricFamily = cast<*MetricFamily>(malloc(sizeof<MetricFamily>()));
        if (family == nullptr) {
            throw "Metrics allocation failed";
        }
        local init: MetricFamily;
        init.name = metricsCopy(name);
        init.help = metricsCopy(help);
        init.kind = kind;
        init.label_names = Array<string>.new(0);
        init.bounds = Array<double>.new(0);
        init.series = Array<*Series>.new(0);
        *family = init;
        local list: string = labelNames;
        if (list == nullptr) {
            list = "";
        }
        local start: int = 0;
        local length: int = cast<int>(strlen(list));
        loop ((length > 0) && (start <= length)) {
            local end: int = start;
            loop ((end < length) && (list[end] != ',')) {
                end = end + 1;
            }
            local label: string = cast<string>(malloc(cast<long>((end - start) + 1)));
            if (label == nullptr) {
                throw "Metrics allocation failed";
            }
            loop (local i: int = start; i < end; i = i + 1) {
                label[i - start] = list[i];
            }
            label[end - start] = 0;
            local reserved: bool = ((label[0] == '_') && (label[1] == '_')) || ((kind == MetricKind.Histogram) && (strcmp(label, "le") == 0));
            local duplicate: bool = false;
            loop (local i: int = 0; i < family.label_names.len(); i = i + 1) {
                if (strcmp(family.label_names.get(i), label) == 0) {
                    duplicate = true;
                }
            }
            if (!metricsValidName(label, false) || reserved || duplicate) {
                free(label);
                family.destroy();
                free(cast<*void>(family));
                throw "Invalid or duplicate label name";
            }
            family.label_names.push(label);
            start = end + 1;
        }
        this.families.push(family);
        return family;
    }
    frame counter(this: *Registry, name: string, help: string, labelNames: string) ret *MetricFamily {
        return this.register(MetricKind.Counter, name, help, labelNames);
    }
    frame gauge(this: *Registry, name: string, help: string, labelNames: string) ret *MetricFamily {
        return this.register(MetricKind.Gauge, name, help, labelNames);
    }
    # `bounds` are bucket upper bounds in increasing order (+Inf is added).
    frame histogram(this: *Registry, name: string, help: string, labelNames: string, bounds: *Array<double>) ret *MetricFamily {
        if ((bounds == nullptr) || (bounds.len() == 0)) {
            throw "Histogram needs at least one bucket bound";
        }
        loop (local i: int = 0; i < bounds.len(); i = i + 1) {
            local bound: double = bounds.get(i);
            if ((bound != bound) || ((bound - bound) != 0.0) || ((i > 0) && (bound <= bounds.get(i - 1)))) {
                throw "Histogram bounds must be finite and strictly increasing";
            }
        }
        local family: *MetricFamily = this.register(MetricKind.Histogram, name, help, labelNames);
        loop (local i: int = 0; i < bounds.len(); i = i + 1) {
            family.bounds.push(bounds.get(i));
        }
        return family;
    }
    # Latency buckets in seconds: 5ms to 10s, like the Prometheus clients.
    frame defaultBuckets() ret Array<double> {
        local bounds: Array<double> = Array<double>.new(11);
        local values: double[11] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0];
        loop (local i: int = 0; i < 11; i = i + 1) {
            bounds.push(values[i]);
        }
        return bounds;
    }
    # The whole registry in the Prometheus text format.
    frame render(this: *Registry) ret String {
        local out: StringBuilder = StringBuilder.new(256);
        local owner: *StringBuilder = &out;
        defer owner.destroy();
        loop (local i: int = 0; i < this.families.len(); i = i + 1) {
            local family: *MetricFamily = this.families.get(i);
            family.write(&out);
        }
        return String.new(out.toString());
    }
    frame destroy(this: *Registry) {
        loop (local i: int = 0; i < this.families.len(); i = i + 1) {
            local family: *MetricFamily = this.families.get(i);
            family.destroy();
            free(cast<*void>(family));
        }
        this.families.destroy();
    }
}
