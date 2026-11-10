# Binary order-by-order market data, modelled on NASDAQ ITCH 5.0 and
# MoldUDP64 framing (simplified field set, same wire conventions:
# big-endian integers, 48-bit nanosecond timestamps, 4-decimal prices).
#
# Messages (after a 1-byte type, 2-byte stock locate, 6-byte timestamp):
#   S system event   u8 code ('O' start, 'C' end)
#   R directory      alpha8 symbol, u32 reference price
#   A add order      u64 ref, u8 side 'B'/'S', u32 shares, u32 price
#   E executed       u64 ref, u32 shares, u64 match number
#   X cancel         u64 ref, u32 cancelled shares
#   D delete         u64 ref
#   U replace        u64 old ref, u64 new ref, u32 shares, u32 price
#   P trade          u64 match number, u8 side, u32 shares, u32 price (non-displayed)
#
# Packets: alpha10 session, u64 sequence of the first message, u16 count,
# then (u16 length, message) pairs. A heartbeat packet has count 0.

import malloc, free from "std/c.bpl";
import [ByteBuf], [ByteReader] from "./wire.bpl";

export [ItchMsg];
export [ItchCodec];
export [MoldPacket];
export [MoldWriter];
export [MoldReader];

struct ItchMsg {
    kind: char,
    locate: int,
    timestamp: long,
    ref: long,
    new_ref: long,
    side: char,
    shares: long,
    price: long,
    match_no: long,
    code: char,
    symbol: char[9],
}

struct ItchCodec {
    frame blank(kind: char, locate: int, timestamp: long) ret ItchMsg {
        local m: ItchMsg;
        m.kind = kind;
        m.locate = locate;
        m.timestamp = timestamp;
        m.ref = 0;
        m.new_ref = 0;
        m.side = ' ';
        m.shares = 0;
        m.price = 0;
        m.match_no = 0;
        m.code = ' ';
        m.symbol[0] = cast<char>(0);
        return m;
    }

    frame bodySize(kind: char) ret int {
        if (kind == 'S') {
            return 10;
        }
        if (kind == 'R') {
            return 21;
        }
        if (kind == 'A') {
            return 26;
        }
        if (kind == 'E') {
            return 29;
        }
        if (kind == 'X') {
            return 21;
        }
        if (kind == 'D') {
            return 17;
        }
        if (kind == 'U') {
            return 33;
        }
        if (kind == 'P') {
            return 26;
        }
        return -1;
    }

    frame encode(m: *ItchMsg, out: *ByteBuf) {
        out.u8(cast<int>(m.kind));
        out.u16be(m.locate);
        out.u48be(m.timestamp);
        if (m.kind == 'S') {
            out.u8(cast<int>(m.code));
        } else if (m.kind == 'R') {
            out.alpha(cast<string>(&m.symbol[0]), 8);
            out.u32be(m.price);
        } else if (m.kind == 'A') {
            out.u64be(m.ref);
            out.u8(cast<int>(m.side));
            out.u32be(m.shares);
            out.u32be(m.price);
        } else if (m.kind == 'E') {
            out.u64be(m.ref);
            out.u32be(m.shares);
            out.u64be(m.match_no);
        } else if (m.kind == 'X') {
            out.u64be(m.ref);
            out.u32be(m.shares);
        } else if (m.kind == 'D') {
            out.u64be(m.ref);
        } else if (m.kind == 'U') {
            out.u64be(m.ref);
            out.u64be(m.new_ref);
            out.u32be(m.shares);
            out.u32be(m.price);
        } else if (m.kind == 'P') {
            out.u64be(m.match_no);
            out.u8(cast<int>(m.side));
            out.u32be(m.shares);
            out.u32be(m.price);
        }
    }

    # Decodes one message of exactly `len` bytes; false for unknown types or
    # wrong lengths.
    frame decode(r: *ByteReader, len: int, m: *ItchMsg) ret bool {
        local start: int = r.pos;
        local kind: char = cast<char>(r.u8());
        local expected: int = ItchCodec.bodySize(kind);
        if ((expected < 0) || (expected != len)) {
            r.skip(len - 1);
            return false;
        }
        *m = ItchCodec.blank(kind, r.u16be(), r.u48be());
        if (kind == 'S') {
            m.code = cast<char>(r.u8());
        } else if (kind == 'R') {
            r.alpha(8, &m.symbol[0], 9);
            m.price = r.u32be();
        } else if (kind == 'A') {
            m.ref = r.u64be();
            m.side = cast<char>(r.u8());
            m.shares = r.u32be();
            m.price = r.u32be();
        } else if (kind == 'E') {
            m.ref = r.u64be();
            m.shares = r.u32be();
            m.match_no = r.u64be();
        } else if (kind == 'X') {
            m.ref = r.u64be();
            m.shares = r.u32be();
        } else if (kind == 'D') {
            m.ref = r.u64be();
        } else if (kind == 'U') {
            m.ref = r.u64be();
            m.new_ref = r.u64be();
            m.shares = r.u32be();
            m.price = r.u32be();
        } else if (kind == 'P') {
            m.match_no = r.u64be();
            m.side = cast<char>(r.u8());
            m.shares = r.u32be();
            m.price = r.u32be();
        }
        return r.ok() && ((r.pos - start) == len);
    }

    frame kindName(kind: char) ret string {
        if (kind == 'S') {
            return "system";
        }
        if (kind == 'R') {
            return "directory";
        }
        if (kind == 'A') {
            return "add";
        }
        if (kind == 'E') {
            return "executed";
        }
        if (kind == 'X') {
            return "cancel";
        }
        if (kind == 'D') {
            return "delete";
        }
        if (kind == 'U') {
            return "replace";
        }
        if (kind == 'P') {
            return "trade";
        }
        return "unknown";
    }
}

# One framed packet (owned bytes).
struct MoldPacket {
    data: ByteBuf,
    sequence: long,
    count: int,
}

# Accumulates messages into packets of at most `max_bytes`, keeping every
# packet so gaps can be re-requested (a retransmission server).
struct MoldWriter {
    session: string,
    next_seq: long,
    max_bytes: int,
    packets: *MoldPacket,
    packet_count: int,
    packet_cap: int,
    current: ByteBuf,
    current_first: long,
    current_count: int,
    scratch: ByteBuf,
    total_bytes: long,
    total_messages: long,

    frame init(this: *MoldWriter, session: string, max_bytes: int) {
        this.session = session;
        this.next_seq = 1;
        this.max_bytes = max_bytes < 64 ? 64 : max_bytes;
        this.packet_cap = 64;
        this.packets = cast<*MoldPacket>(ItchAlloc.bytes(cast<long>(this.packet_cap) * sizeof(MoldPacket)));
        this.packet_count = 0;
        this.current = ByteBuf.new(this.max_bytes);
        this.current_first = 1;
        this.current_count = 0;
        this.scratch = ByteBuf.new(64);
        this.total_bytes = 0;
        this.total_messages = 0;
    }

    frame destroy(this: *MoldWriter) {
        loop (local i: int = 0; i < this.packet_count; i = i + 1) {
            this.packets[i].data.destroy();
        }
        ItchAlloc.release(cast<*void>(this.packets));
        this.packets = nullptr;
        this.current.destroy();
        this.scratch.destroy();
    }

    frame header(this: *MoldWriter, out: *ByteBuf, first: long, count: int) {
        out.alpha(this.session, 10);
        out.u64be(first);
        out.u16be(count);
    }

    frame add(this: *MoldWriter, m: *ItchMsg) {
        this.scratch.clear();
        ItchCodec.encode(m, &this.scratch);
        if ((this.current_count > 0) && ((20 + this.current.len + 2 + this.scratch.len) > this.max_bytes)) {
            this.flush();
        }
        if (this.current_count == 0) {
            this.current_first = this.next_seq;
        }
        this.current.u16be(this.scratch.len);
        this.current.bytes(this.scratch.data, this.scratch.len);
        this.current_count = this.current_count + 1;
        this.next_seq = this.next_seq + 1;
        this.total_messages = this.total_messages + 1;
    }

    frame flush(this: *MoldWriter) {
        if (this.current_count == 0) {
            return;
        }
        if (this.packet_count == this.packet_cap) {
            local next: *MoldPacket = cast<*MoldPacket>(ItchAlloc.bytes(cast<long>(this.packet_cap * 2) * sizeof(MoldPacket)));
            loop (local i: int = 0; i < this.packet_count; i = i + 1) {
                next[i] = this.packets[i];
            }
            ItchAlloc.release(cast<*void>(this.packets));
            this.packets = next;
            this.packet_cap = this.packet_cap * 2;
        }
        local p: *MoldPacket = this.packets + this.packet_count;
        p.data = ByteBuf.new(20 + this.current.len);
        this.header(&p.data, this.current_first, this.current_count);
        p.data.bytes(this.current.data, this.current.len);
        p.sequence = this.current_first;
        p.count = this.current_count;
        this.packet_count = this.packet_count + 1;
        this.total_bytes = this.total_bytes + cast<long>(p.data.len);
        this.current.clear();
        this.current_count = 0;
    }

    # Index of the packet holding message `seq`, or -1.
    frame packetFor(this: *MoldWriter, seq: long) ret int {
        local lo: int = 0;
        local hi: int = this.packet_count - 1;
        loop (lo <= hi) {
            local mid: int = (lo + hi) / 2;
            local p: *MoldPacket = this.packets + mid;
            if (seq < p.sequence) {
                hi = mid - 1;
            } else if (seq >= (p.sequence + cast<long>(p.count))) {
                lo = mid + 1;
            } else {
                return mid;
            }
        }
        return -1;
    }
}

# Packet consumer: tracks the expected sequence, reports gaps and decodes
# messages in order.
struct MoldReader {
    expected: long,
    gaps: long,
    gap_messages: long,
    duplicates: long,
    bad: long,
    messages: long,
    session: char[11],

    frame init(this: *MoldReader) {
        this.expected = 1;
        this.gaps = 0;
        this.gap_messages = 0;
        this.duplicates = 0;
        this.bad = 0;
        this.messages = 0;
        this.session[0] = cast<char>(0);
    }

    # Returns the first sequence missing before this packet (0 when the
    # packet is in order or a duplicate). Messages already seen are skipped;
    # out-of-order packets are not applied, the caller recovers the gap first.
    frame accept(this: *MoldReader, data: *u8, len: int, on_msg: Lambda<void>(*ItchMsg)) ret long {
        local r: ByteReader = ByteReader.over(data, len);
        r.alpha(10, &this.session[0], 11);
        local first: long = r.u64be();
        local count: int = r.u16be();
        if (!r.ok()) {
            this.bad = this.bad + 1;
            return 0;
        }
        if (first > this.expected) {
            this.gaps = this.gaps + 1;
            this.gap_messages = this.gap_messages + (first - this.expected);
            return this.expected;
        }
        local seq: long = first;
        loop (local i: int = 0; i < count; i = i + 1) {
            local mlen: int = r.u16be();
            if (!r.ok()) {
                this.bad = this.bad + 1;
                return 0;
            }
            if (seq < this.expected) {
                r.skip(mlen);
                this.duplicates = this.duplicates + 1;
            } else {
                local m: ItchMsg;
                if (ItchCodec.decode(&r, mlen, &m)) {
                    on_msg(&m);
                    this.messages = this.messages + 1;
                } else {
                    this.bad = this.bad + 1;
                }
                this.expected = seq + 1;
            }
            seq = seq + 1;
        }
        return 0;
    }

    frame sessionName(this: *MoldReader) ret string {
        return cast<string>(&this.session[0]);
    }
}

struct ItchAlloc {
    frame bytes(n: long) ret *void {
        local p: *void = malloc(n);
        if (p == nullptr) {
            throw "allocation failed";
        }
        return p;
    }

    frame release(p: *void) {
        free(p);
    }
}
