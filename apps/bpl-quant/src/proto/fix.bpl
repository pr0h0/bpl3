# FIX 4.4 tag=value codec.
#
# FixMessage parses one framed message and checks BeginString, BodyLength
# and CheckSum; fields are kept in order so repeating groups can be walked
# with findFrom(). FixBuilder assembles a message body and finish() prepends
# BeginString/BodyLength and appends the CheckSum. The field delimiter is SOH
# (0x01) on the wire; tests and the API also accept '|' for readability.
#
# Prices travel as decimal text and are converted to integer ticks without
# going through floating point.

import malloc, free from "std/c.bpl";
import [Text] from "../core/text.bpl";
import [CharBuf] from "../core/strlist.bpl";

export [FixField];
export [FixMessage];
export [FixBuilder];
export [FixTag];
export [FixTime];
export [FixDecimal];

global const MAX_FIX_FIELDS: int = 256;
global const SOH: char = cast<char>(1);

struct FixTag {
    frame account() ret int {
        return 1;
    }
    frame avgPx() ret int {
        return 6;
    }
    frame beginSeqNo() ret int {
        return 7;
    }
    frame beginString() ret int {
        return 8;
    }
    frame bodyLength() ret int {
        return 9;
    }
    frame checkSum() ret int {
        return 10;
    }
    frame clOrdId() ret int {
        return 11;
    }
    frame cumQty() ret int {
        return 14;
    }
    frame endSeqNo() ret int {
        return 16;
    }
    frame execId() ret int {
        return 17;
    }
    frame lastPx() ret int {
        return 31;
    }
    frame lastQty() ret int {
        return 32;
    }
    frame msgSeqNum() ret int {
        return 34;
    }
    frame msgType() ret int {
        return 35;
    }
    frame newSeqNo() ret int {
        return 36;
    }
    frame orderId() ret int {
        return 37;
    }
    frame orderQty() ret int {
        return 38;
    }
    frame ordStatus() ret int {
        return 39;
    }
    frame ordType() ret int {
        return 40;
    }
    frame origClOrdId() ret int {
        return 41;
    }
    frame possDupFlag() ret int {
        return 43;
    }
    frame price() ret int {
        return 44;
    }
    frame refSeqNum() ret int {
        return 45;
    }
    frame senderCompId() ret int {
        return 49;
    }
    frame sendingTime() ret int {
        return 52;
    }
    frame side() ret int {
        return 54;
    }
    frame symbol() ret int {
        return 55;
    }
    frame targetCompId() ret int {
        return 56;
    }
    frame text() ret int {
        return 58;
    }
    frame timeInForce() ret int {
        return 59;
    }
    frame encryptMethod() ret int {
        return 98;
    }
    frame stopPx() ret int {
        return 99;
    }
    frame ordRejReason() ret int {
        return 103;
    }
    frame heartBtInt() ret int {
        return 108;
    }
    frame testReqId() ret int {
        return 112;
    }
    frame gapFillFlag() ret int {
        return 123;
    }
    frame execType() ret int {
        return 150;
    }
    frame leavesQty() ret int {
        return 151;
    }
    frame mdReqId() ret int {
        return 262;
    }
    frame marketDepth() ret int {
        return 264;
    }
    frame noMdEntries() ret int {
        return 268;
    }
    frame mdEntryType() ret int {
        return 269;
    }
    frame mdEntryPx() ret int {
        return 270;
    }
    frame mdEntrySize() ret int {
        return 271;
    }
    frame mdUpdateAction() ret int {
        return 279;
    }
    frame sessionRejectReason() ret int {
        return 373;
    }
    frame cxlRejResponseTo() ret int {
        return 434;
    }
}

struct FixField {
    tag: int,
    start: int,
    len: int,
}

struct FixMessage {
    raw: *char,
    raw_len: int,
    fields: *FixField,
    count: int,
    error: string,
    checksum_ok: bool,
    length_ok: bool,

    # Parses `text` (n bytes) in place into an owned copy. Returns false with
    # `error` set when the framing is invalid.
    frame parse(this: *FixMessage, text: *char, n: int, delim: char) ret bool {
        this.raw = cast<*char>(malloc(cast<long>(n + 1)));
        this.fields = cast<*FixField>(malloc(cast<long>(MAX_FIX_FIELDS) * sizeof(FixField)));
        this.raw_len = n;
        this.count = 0;
        this.error = nullptr;
        this.checksum_ok = false;
        this.length_ok = false;
        loop (local i: int = 0; i < n; i = i + 1) {
            this.raw[i] = text[i] == delim ? SOH : text[i];
        }
        this.raw[n] = cast<char>(0);
        local pos: int = 0;
        local body_start: int = -1;
        local checksum_start: int = -1;
        loop (pos < n) {
            local tag: int = 0;
            local digits: int = 0;
            loop ((pos < n) && (this.raw[pos] >= '0') && (this.raw[pos] <= '9')) {
                tag = (tag * 10) + (cast<int>(this.raw[pos]) - 48);
                pos = pos + 1;
                digits = digits + 1;
                if (digits > 6) {
                    this.error = "tag too long";
                    return false;
                }
            }
            if ((digits == 0) || (pos >= n) || (this.raw[pos] != '=')) {
                this.error = "malformed field";
                return false;
            }
            pos = pos + 1;
            local start: int = pos;
            loop ((pos < n) && (this.raw[pos] != SOH)) {
                pos = pos + 1;
            }
            if (pos >= n) {
                this.error = "field not terminated";
                return false;
            }
            if (this.count == MAX_FIX_FIELDS) {
                this.error = "too many fields";
                return false;
            }
            if (tag == 10) {
                checksum_start = this.fieldStartOfTag(start);
            }
            this.fields[this.count] = FixField { tag: tag, start: start, len: pos - start };
            this.count = this.count + 1;
            this.raw[pos] = cast<char>(0);
            pos = pos + 1;
            if ((this.count == 2) && (tag == 9)) {
                body_start = pos;
            }
            if (tag == 10) {
                break;
            }
        }
        if ((this.count < 4) || (this.fields[0].tag != 8) || (this.fields[1].tag != 9) || (this.fields[2].tag != 35)) {
            this.error = "header must start with 8, 9, 35";
            return false;
        }
        if (this.fields[this.count - 1].tag != 10) {
            this.error = "missing CheckSum";
            return false;
        }
        if (pos != n) {
            this.error = "data after CheckSum";
            return false;
        }
        local declared: long = this.getLong(9, -1);
        this.length_ok = declared == cast<long>(checksum_start - body_start);
        local sum: int = 0;
        loop (local i: int = 0; i < checksum_start; i = i + 1) {
            local c: char = this.raw[i] == cast<char>(0) ? SOH : this.raw[i];
            sum = sum + cast<int>(cast<uchar>(c));
        }
        this.checksum_ok = (sum % 256) == cast<int>(this.getLong(10, -1));
        if (!this.length_ok) {
            this.error = "BodyLength mismatch";
            return false;
        }
        if (!this.checksum_ok) {
            this.error = "CheckSum mismatch";
            return false;
        }
        return true;
    }

    # Offset of the "10=" that precedes the value starting at `value_start`.
    frame fieldStartOfTag(this: *FixMessage, value_start: int) ret int {
        return value_start - 3;
    }

    frame destroy(this: *FixMessage) {
        if (this.raw != nullptr) {
            free(cast<*void>(this.raw));
            this.raw = nullptr;
        }
        if (this.fields != nullptr) {
            free(cast<*void>(this.fields));
            this.fields = nullptr;
        }
        this.count = 0;
    }

    frame findFrom(this: *FixMessage, tag: int, start_at: int) ret int {
        loop (local i: int = start_at; i < this.count; i = i + 1) {
            if (this.fields[i].tag == tag) {
                return i;
            }
        }
        return -1;
    }

    frame has(this: *FixMessage, tag: int) ret bool {
        return this.findFrom(tag, 0) >= 0;
    }

    frame valueAt(this: *FixMessage, index: int) ret string {
        return cast<string>(this.raw + this.fields[index].start);
    }

    frame get(this: *FixMessage, tag: int) ret string {
        local i: int = this.findFrom(tag, 0);
        if (i < 0) {
            return nullptr;
        }
        return this.valueAt(i);
    }

    frame getOr(this: *FixMessage, tag: int, fallback: string) ret string {
        local v: string = this.get(tag);
        return v == nullptr ? fallback : v;
    }

    frame getLong(this: *FixMessage, tag: int, fallback: long) ret long {
        local v: string = this.get(tag);
        if (v == nullptr) {
            return fallback;
        }
        return FixDecimal.parseLong(v, fallback);
    }

    frame msgType(this: *FixMessage) ret string {
        return this.valueAt(2);
    }

    frame isType(this: *FixMessage, t: string) ret bool {
        return Text.equals(this.valueAt(2), t);
    }

    frame seqNum(this: *FixMessage) ret long {
        return this.getLong(34, 0);
    }

    frame isPossDup(this: *FixMessage) ret bool {
        return Text.equals(this.getOr(43, "N"), "Y");
    }

    # Price-like field as ticks (`scale` decimals); `ok` is cleared on error.
    frame getTicks(this: *FixMessage, tag: int, scale: int, ok: *bool) ret long {
        local v: string = this.get(tag);
        if (v == nullptr) {
            *ok = false;
            return 0;
        }
        return FixDecimal.parseTicks(v, scale, ok);
    }

    # Pipe-delimited rendering for logs and JSON.
    frame render(this: *FixMessage, out: *CharBuf) {
        loop (local i: int = 0; i < this.count; i = i + 1) {
            out.integer(cast<long>(this.fields[i].tag));
            out.ch('=');
            out.str(this.valueAt(i));
            out.ch('|');
        }
    }
}

struct FixDecimal {
    frame parseLong(s: string, fallback: long) ret long {
        local i: int = 0;
        local negative: bool = false;
        if (s[0] == '-') {
            negative = true;
            i = 1;
        }
        if (s[i] == cast<char>(0)) {
            return fallback;
        }
        local v: long = 0;
        loop (s[i] != cast<char>(0)) {
            if ((s[i] < '0') || (s[i] > '9') || (v > 100000000000000000)) {
                return fallback;
            }
            v = (v * 10) + cast<long>(cast<int>(s[i]) - 48);
            i = i + 1;
        }
        return negative ? -v : v;
    }

    # "101.25" with scale 4 -> 1012500. Rejects more than `scale` decimals
    # unless the extra digits are zero.
    frame parseTicks(s: string, scale: int, ok: *bool) ret long {
        local i: int = 0;
        local negative: bool = false;
        if (s[0] == '-') {
            negative = true;
            i = 1;
        }
        local whole: long = 0;
        local digits: int = 0;
        loop ((s[i] >= '0') && (s[i] <= '9')) {
            whole = (whole * 10) + cast<long>(cast<int>(s[i]) - 48);
            i = i + 1;
            digits = digits + 1;
            if (digits > 12) {
                *ok = false;
                return 0;
            }
        }
        local frac: long = 0;
        local frac_digits: int = 0;
        if (s[i] == '.') {
            i = i + 1;
            loop ((s[i] >= '0') && (s[i] <= '9')) {
                if (frac_digits < scale) {
                    frac = (frac * 10) + cast<long>(cast<int>(s[i]) - 48);
                    frac_digits = frac_digits + 1;
                } else if (s[i] != '0') {
                    *ok = false;
                    return 0;
                }
                digits = digits + 1;
                i = i + 1;
            }
        }
        if ((digits == 0) || (s[i] != cast<char>(0))) {
            *ok = false;
            return 0;
        }
        loop (frac_digits < scale) {
            frac = frac * 10;
            frac_digits = frac_digits + 1;
        }
        local unit: long = 1;
        loop (local k: int = 0; k < scale; k = k + 1) {
            unit = unit * 10;
        }
        local v: long = (whole * unit) + frac;
        return negative ? -v : v;
    }
}

# UTC timestamps in FIX format: YYYYMMDD-HH:MM:SS.sss.
struct FixTime {
    # Days since 1970-01-01 -> (year, month, day), Howard Hinnant's algorithm.
    frame civil(days: long, year: *long, month: *int, day: *int) {
        local z: long = days + 719468;
        local era: long = (z >= 0 ? z : z - 146096) / 146097;
        local doe: long = z - (era * 146097);
        local yoe: long = (((doe - (doe / 1460)) + (doe / 36524)) - (doe / 146096)) / 365;
        local y: long = yoe + (era * 400);
        local doy: long = doe - (((365 * yoe) + (yoe / 4)) - (yoe / 100));
        local mp: long = ((5 * doy) + 2) / 153;
        local d: long = (doy - (((153 * mp) + 2) / 5)) + 1;
        local m: long = mp < 10 ? mp + 3 : mp - 9;
        *year = m <= 2 ? y + 1 : y;
        *month = cast<int>(m);
        *day = cast<int>(d);
    }

    frame daysFromCivil(y0: long, m: int, d: int) ret long {
        local y: long = m <= 2 ? y0 - 1 : y0;
        local era: long = (y >= 0 ? y : y - 399) / 400;
        local yoe: long = y - (era * 400);
        local mm: long = cast<long>(m > 2 ? m - 3 : m + 9);
        local doy: long = ((((153 * mm) + 2) / 5) + cast<long>(d)) - 1;
        local doe: long = (((yoe * 365) + (yoe / 4)) - (yoe / 100)) + doy;
        return ((era * 146097) + doe) - 719468;
    }

    frame format(epoch_ms: long, out: *CharBuf) {
        local days: long = epoch_ms / 86400000;
        local ms_of_day: long = epoch_ms % 86400000;
        if (ms_of_day < 0) {
            ms_of_day = ms_of_day + 86400000;
            days = days - 1;
        }
        local y: long = 0;
        local m: int = 0;
        local d: int = 0;
        FixTime.civil(days, &y, &m, &d);
        out.padded(y, 4);
        out.padded(cast<long>(m), 2);
        out.padded(cast<long>(d), 2);
        out.ch('-');
        out.padded(ms_of_day / 3600000, 2);
        out.ch(':');
        out.padded((ms_of_day / 60000) % 60, 2);
        out.ch(':');
        out.padded((ms_of_day / 1000) % 60, 2);
        out.ch('.');
        out.padded(ms_of_day % 1000, 3);
    }

    frame digitsAt(s: string, at: int, n: int, ok: *bool) ret long {
        local v: long = 0;
        loop (local i: int = 0; i < n; i = i + 1) {
            local c: char = s[at + i];
            if ((c < '0') || (c > '9')) {
                *ok = false;
                return 0;
            }
            v = (v * 10) + cast<long>(cast<int>(c) - 48);
        }
        return v;
    }

    # Parses YYYYMMDD-HH:MM:SS[.sss]; returns -1 on error.
    frame parse(s: string) ret long {
        local n: int = Text.length(s);
        if ((n != 17) && (n != 21)) {
            return -1;
        }
        if ((s[8] != '-') || (s[11] != ':') || (s[14] != ':')) {
            return -1;
        }
        local ok: bool = true;
        local y: long = FixTime.digitsAt(s, 0, 4, &ok);
        local mo: long = FixTime.digitsAt(s, 4, 2, &ok);
        local d: long = FixTime.digitsAt(s, 6, 2, &ok);
        local h: long = FixTime.digitsAt(s, 9, 2, &ok);
        local mi: long = FixTime.digitsAt(s, 12, 2, &ok);
        local sec: long = FixTime.digitsAt(s, 15, 2, &ok);
        local ms: long = 0;
        if (n == 21) {
            if (s[17] != '.') {
                return -1;
            }
            ms = FixTime.digitsAt(s, 18, 3, &ok);
        }
        if (!ok || (mo < 1) || (mo > 12) || (d < 1) || (d > 31) || (h > 23) || (mi > 59) || (sec > 60)) {
            return -1;
        }
        local days: long = FixTime.daysFromCivil(y, cast<int>(mo), cast<int>(d));
        return (days * 86400000) + (h * 3600000) + (mi * 60000) + (sec * 1000) + ms;
    }
}

struct FixBuilder {
    body: CharBuf,
    out: CharBuf,
    delim: char,

    frame create(delim: char) ret FixBuilder {
        return FixBuilder { body: CharBuf.new(256), out: CharBuf.new(320), delim: delim };
    }

    frame destroy(this: *FixBuilder) {
        this.body.destroy();
        this.out.destroy();
    }

    # Starts a message with the standard header.
    frame begin(this: *FixBuilder, msg_type: string, sender: string, target: string, seq: long, epoch_ms: long) {
        this.body.clear();
        this.field(35, msg_type);
        this.field(49, sender);
        this.field(56, target);
        this.fieldLong(34, seq);
        this.body.integer(52);
        this.body.ch('=');
        FixTime.format(epoch_ms, &this.body);
        this.body.ch(this.delim);
    }

    frame field(this: *FixBuilder, tag: int, value: string) {
        this.body.integer(cast<long>(tag));
        this.body.ch('=');
        this.body.str(value);
        this.body.ch(this.delim);
    }

    frame fieldLong(this: *FixBuilder, tag: int, value: long) {
        this.body.integer(cast<long>(tag));
        this.body.ch('=');
        this.body.integer(value);
        this.body.ch(this.delim);
    }

    frame fieldTicks(this: *FixBuilder, tag: int, ticks: long, scale: int) {
        this.body.integer(cast<long>(tag));
        this.body.ch('=');
        this.body.decimal(ticks, scale);
        this.body.ch(this.delim);
    }

    frame fieldChar(this: *FixBuilder, tag: int, value: char) {
        this.body.integer(cast<long>(tag));
        this.body.ch('=');
        this.body.ch(value);
        this.body.ch(this.delim);
    }

    # Completes the message; the returned text stays valid until the next
    # begin() or finish().
    frame finish(this: *FixBuilder) ret string {
        this.out.clear();
        this.out.str("8=FIX.4.4");
        this.out.ch(this.delim);
        this.out.str("9=");
        this.out.integer(cast<long>(this.body.len));
        this.out.ch(this.delim);
        this.out.strN(this.body.data, this.body.len);
        local sum: int = 0;
        loop (local i: int = 0; i < this.out.len; i = i + 1) {
            local c: char = this.out.data[i] == this.delim ? SOH : this.out.data[i];
            sum = sum + cast<int>(cast<uchar>(c));
        }
        this.out.str("10=");
        this.out.padded(cast<long>(sum % 256), 3);
        this.out.ch(this.delim);
        return this.out.text();
    }

    frame length(this: *FixBuilder) ret int {
        return this.out.len;
    }
}
