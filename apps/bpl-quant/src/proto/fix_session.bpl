# FIX session layer: logon, heartbeats and test requests, sequence numbers,
# gap detection with ResendRequest, gap fill with SequenceReset, PossDup
# replays and logout.
#
# A session never touches a socket. receive() takes one framed message,
# outgoing messages are appended to `outbox`, and tick() drives timers from
# a caller-supplied clock, so two sessions can be wired together in memory
# and tested deterministically. Application messages that arrive in sequence
# are handed to the caller's handler; ones that arrive ahead of a gap are
# queued and delivered once the gap is filled.

import [Text] from "../core/text.bpl";
import [StrList], [CharBuf] from "../core/strlist.bpl";
import [FixMessage], [FixBuilder] from "./fix.bpl";

export [FixSession];
export [SessionState];
export [FixSessionStats];

enum SessionState {
    Disconnected,
    LogonSent,
    Active,
    LogoutSent,
    Closed,
}

struct FixSessionStats {
    received: long,
    sent: long,
    app_received: long,
    resend_requests: long,
    gap_fills: long,
    replayed: long,
    duplicates: long,
    garbled: long,
    rejects: long,
    queued: long,
    test_requests: long,
}

struct FixSession {
    sender: string,
    target: string,
    state: SessionState,
    out_seq: long,
    in_seq: long,
    heartbeat_ms: long,
    last_recv_ms: long,
    last_sent_ms: long,
    now_ms: long,
    test_req_pending: bool,
    test_req_counter: long,
    delim: char,
    builder: FixBuilder,
    outbox: StrList,
    # sent[seq - 1] holds every message we sent, for resends.
    sent: StrList,
    sent_admin: StrList,
    # Messages received ahead of a gap (raw text) and their sequence numbers.
    pending: StrList,
    resend_target: long,
    logout_reason: string,
    stats: FixSessionStats,

    frame init(this: *FixSession, sender: string, target: string, heartbeat_s: int, delim: char) {
        this.sender = Text.copy(sender);
        this.target = Text.copy(target);
        this.state = SessionState.Disconnected;
        this.out_seq = 1;
        this.in_seq = 1;
        this.heartbeat_ms = cast<long>(heartbeat_s) * 1000;
        this.last_recv_ms = 0;
        this.last_sent_ms = 0;
        this.now_ms = 0;
        this.test_req_pending = false;
        this.test_req_counter = 0;
        this.delim = delim;
        this.builder = FixBuilder.create(delim);
        this.outbox = StrList.new(16);
        this.sent = StrList.new(64);
        this.sent_admin = StrList.new(64);
        this.pending = StrList.new(8);
        this.resend_target = 0;
        this.logout_reason = nullptr;
        this.stats = FixSessionStats { received: 0, sent: 0, app_received: 0, resend_requests: 0, gap_fills: 0, replayed: 0, duplicates: 0, garbled: 0, rejects: 0, queued: 0, test_requests: 0 };
    }

    frame destroy(this: *FixSession) {
        Text.release(this.sender);
        Text.release(this.target);
        this.builder.destroy();
        this.outbox.destroy();
        this.sent.destroy();
        this.sent_admin.destroy();
        this.pending.destroy();
    }

    frame isActive(this: *FixSession) ret bool {
        return this.state == SessionState.Active;
    }

    frame stateName(this: *FixSession) ret string {
        if (this.state == SessionState.Disconnected) {
            return "disconnected";
        }
        if (this.state == SessionState.LogonSent) {
            return "logon_sent";
        }
        if (this.state == SessionState.Active) {
            return "active";
        }
        if (this.state == SessionState.LogoutSent) {
            return "logout_sent";
        }
        return "closed";
    }

    # Starts a message of `msg_type` carrying the next sequence number.
    frame start(this: *FixSession, msg_type: string) ret *FixBuilder {
        this.builder.begin(msg_type, this.sender, this.target, this.out_seq, this.now_ms);
        return &this.builder;
    }

    # Finishes the message started with start(), stores it for resends and
    # queues it for delivery.
    frame send(this: *FixSession, admin: bool) {
        local text: string = this.builder.finish();
        this.sent.push(text);
        this.sent_admin.push(admin ? "Y" : "N");
        this.outbox.push(text);
        this.out_seq = this.out_seq + 1;
        this.last_sent_ms = this.now_ms;
        this.stats.sent = this.stats.sent + 1;
    }

    frame logon(this: *FixSession, now_ms: long, reset: bool) {
        this.now_ms = now_ms;
        if (reset) {
            this.out_seq = 1;
            this.in_seq = 1;
        }
        local b: *FixBuilder = this.start("A");
        b.fieldLong(98, 0);
        b.fieldLong(108, this.heartbeat_ms / 1000);
        if (reset) {
            b.field(141, "Y");
        }
        this.send(true);
        this.state = SessionState.LogonSent;
        this.last_recv_ms = now_ms;
    }

    frame logout(this: *FixSession, reason: string) {
        local b: *FixBuilder = this.start("5");
        if (reason != nullptr) {
            b.field(58, reason);
        }
        this.send(true);
        this.state = SessionState.LogoutSent;
    }

    frame heartbeat(this: *FixSession, test_req_id: string) {
        local b: *FixBuilder = this.start("0");
        if (test_req_id != nullptr) {
            b.field(112, test_req_id);
        }
        this.send(true);
    }

    frame reject(this: *FixSession, ref_seq: long, reason: int, text: string) {
        local b: *FixBuilder = this.start("3");
        b.fieldLong(45, ref_seq);
        b.fieldLong(373, cast<long>(reason));
        b.field(58, text);
        this.send(true);
        this.stats.rejects = this.stats.rejects + 1;
    }

    frame requestResend(this: *FixSession, first_seq: long) {
        local b: *FixBuilder = this.start("2");
        b.fieldLong(7, first_seq);
        b.fieldLong(16, 0);
        this.send(true);
        this.stats.resend_requests = this.stats.resend_requests + 1;
    }

    # Replays [from, to] (to = 0 means everything sent). Admin messages are
    # collapsed into SequenceReset-GapFill runs; application messages are
    # re-sent with PossDupFlag=Y and their original sequence numbers.
    frame resend(this: *FixSession, first_seq: long, to: long) {
        local last: long = this.out_seq - 1;
        local end: long = (to == 0) || (to > last) ? last : to;
        local seq: long = first_seq < 1 ? 1 : first_seq;
        local saved_out: long = this.out_seq;
        loop (seq <= end) {
            if (Text.equals(this.sent_admin.get(cast<int>(seq - 1)), "Y")) {
                local run_end: long = seq;
                loop (((run_end + 1) <= end) && Text.equals(this.sent_admin.get(cast<int>(run_end)), "Y")) {
                    run_end = run_end + 1;
                }
                this.builder.begin("4", this.sender, this.target, seq, this.now_ms);
                this.builder.field(43, "Y");
                this.builder.field(123, "Y");
                this.builder.fieldLong(36, run_end + 1);
                this.outbox.push(this.builder.finish());
                this.stats.gap_fills = this.stats.gap_fills + 1;
                seq = run_end + 1;
            } else {
                local original: FixMessage;
                local text: string = this.sent.get(cast<int>(seq - 1));
                if (original.parse(cast<*char>(text), Text.length(text), this.delim)) {
                    this.builder.begin(original.msgType(), this.sender, this.target, seq, this.now_ms);
                    this.builder.field(43, "Y");
                    # Copy the body fields after the standard header (8, 9, 35, 49, 56, 34, 52).
                    loop (local i: int = 7; i < (original.count - 1); i = i + 1) {
                        if (original.fields[i].tag != 43) {
                            this.builder.field(original.fields[i].tag, original.valueAt(i));
                        }
                    }
                    this.outbox.push(this.builder.finish());
                    this.stats.replayed = this.stats.replayed + 1;
                }
                original.destroy();
                seq = seq + 1;
            }
        }
        this.out_seq = saved_out;
        this.last_sent_ms = this.now_ms;
    }

    # Handles one incoming message. `on_app` is called for application
    # messages in sequence order.
    frame receive(this: *FixSession, text: string, now_ms: long, on_app: Lambda<void>(*FixMessage)) {
        this.now_ms = now_ms;
        local m: FixMessage;
        local owner: *FixMessage = &m;
        defer owner.destroy();
        if (!m.parse(cast<*char>(text), Text.length(text), this.delim)) {
            # Garbled messages are ignored; the gap logic recovers them.
            this.stats.garbled = this.stats.garbled + 1;
            return;
        }
        this.stats.received = this.stats.received + 1;
        this.last_recv_ms = now_ms;
        this.test_req_pending = false;
        if (!Text.equals(m.getOr(49, ""), this.target) || !Text.equals(m.getOr(56, ""), this.sender)) {
            this.reject(m.seqNum(), 9, "CompID problem");
            this.logout("CompID problem");
            return;
        }
        local seq: long = m.seqNum();
        if (seq <= 0) {
            this.reject(0, 1, "MsgSeqNum missing");
            return;
        }
        local gap_fill: bool = m.isType("4") && Text.equals(m.getOr(123, "N"), "Y");
        if (m.isType("4") && !gap_fill) {
            # SequenceReset-Reset ignores the sequence number entirely.
            local next: long = m.getLong(36, 0);
            if (next > this.in_seq) {
                this.in_seq = next;
            }
            this.drainPending(on_app);
            return;
        }
        if (seq < this.in_seq) {
            if (m.isPossDup()) {
                this.stats.duplicates = this.stats.duplicates + 1;
                return;
            }
            this.logout("MsgSeqNum too low");
            this.logout_reason = "sequence too low";
            return;
        }
        if (seq > this.in_seq) {
            # Gap: logon/logout are processed; everything else waits.
            if (m.isType("A")) {
                this.onLogon(&m);
            } else if (m.isType("5")) {
                this.onLogout(&m);
                return;
            } else if (m.isType("2")) {
                this.onResendRequest(&m);
            }
            if (!m.isType("A") && !m.isType("2")) {
                this.pending.push(text);
                this.stats.queued = this.stats.queued + 1;
            }
            if (this.resend_target == 0) {
                this.requestResend(this.in_seq);
                this.resend_target = seq;
            }
            return;
        }
        this.process(&m, on_app);
        this.drainPending(on_app);
    }

    # Processes an in-sequence message and advances in_seq.
    frame process(this: *FixSession, m: *FixMessage, on_app: Lambda<void>(*FixMessage)) {
        local seq: long = m.seqNum();
        if (m.isType("4")) {
            local next: long = m.getLong(36, seq + 1);
            this.in_seq = next > seq ? next : seq + 1;
            return;
        }
        this.in_seq = seq + 1;
        if (m.isType("A")) {
            this.onLogon(m);
        } else if (m.isType("0")) {
            return;
        } else if (m.isType("1")) {
            this.heartbeat(m.getOr(112, "TEST"));
        } else if (m.isType("2")) {
            this.onResendRequest(m);
        } else if (m.isType("3")) {
            this.stats.rejects = this.stats.rejects + 1;
        } else if (m.isType("5")) {
            this.onLogout(m);
        } else {
            if (this.state != SessionState.Active) {
                this.reject(seq, 0, "not logged on");
                return;
            }
            this.stats.app_received = this.stats.app_received + 1;
            on_app(m);
        }
    }

    frame onLogon(this: *FixSession, m: *FixMessage) {
        if (this.state == SessionState.Disconnected) {
            # Acceptor side: answer with our own logon.
            local hb: long = m.getLong(108, this.heartbeat_ms / 1000);
            this.heartbeat_ms = hb * 1000;
            local b: *FixBuilder = this.start("A");
            b.fieldLong(98, 0);
            b.fieldLong(108, hb);
            this.send(true);
        }
        this.state = SessionState.Active;
    }

    frame onLogout(this: *FixSession, m: *FixMessage) {
        if (this.state != SessionState.LogoutSent) {
            this.logout(nullptr);
        }
        this.logout_reason = m.get(58) == nullptr ? "logout" : "peer logout";
        this.state = SessionState.Closed;
    }

    frame onResendRequest(this: *FixSession, m: *FixMessage) {
        this.resend(m.getLong(7, 1), m.getLong(16, 0));
    }

    # Delivers queued messages whose turn has come.
    frame drainPending(this: *FixSession, on_app: Lambda<void>(*FixMessage)) {
        local progressed: bool = true;
        loop (progressed && (this.pending.count > 0)) {
            progressed = false;
            loop (local i: int = 0; i < this.pending.count; i = i + 1) {
                local text: string = this.pending.get(i);
                local q: FixMessage;
                if (!q.parse(cast<*char>(text), Text.length(text), this.delim)) {
                    q.destroy();
                    Text.release(this.pending.take(i));
                    progressed = true;
                    break;
                }
                local seq: long = q.seqNum();
                if (seq < this.in_seq) {
                    q.destroy();
                    Text.release(this.pending.take(i));
                    progressed = true;
                    break;
                }
                if (seq == this.in_seq) {
                    this.process(&q, on_app);
                    q.destroy();
                    Text.release(this.pending.take(i));
                    progressed = true;
                    break;
                }
                q.destroy();
            }
        }
        if ((this.resend_target > 0) && (this.in_seq > this.resend_target)) {
            this.resend_target = 0;
        }
    }

    # Timer work: heartbeats when idle, a TestRequest after 1.2 intervals of
    # silence, and disconnect after two intervals with no answer.
    frame tick(this: *FixSession, now_ms: long) {
        this.now_ms = now_ms;
        if ((this.state != SessionState.Active) || (this.heartbeat_ms <= 0)) {
            return;
        }
        local silent: long = now_ms - this.last_recv_ms;
        if (silent >= (2 * this.heartbeat_ms)) {
            this.logout("heartbeat timeout");
            this.logout_reason = "heartbeat timeout";
            this.state = SessionState.Closed;
            return;
        }
        if ((silent >= ((this.heartbeat_ms * 6) / 5)) && !this.test_req_pending) {
            this.test_req_counter = this.test_req_counter + 1;
            local id: CharBuf = CharBuf.new(16);
            id.str("TR");
            id.integer(this.test_req_counter);
            local b: *FixBuilder = this.start("1");
            b.field(112, id.text());
            this.send(true);
            id.destroy();
            this.test_req_pending = true;
            this.stats.test_requests = this.stats.test_requests + 1;
            return;
        }
        if ((now_ms - this.last_sent_ms) >= this.heartbeat_ms) {
            this.heartbeat(nullptr);
        }
    }

    # Moves the outbox into `into` (the caller then owns those strings).
    frame drain(this: *FixSession, into: *StrList) {
        loop (local i: int = 0; i < this.outbox.count; i = i + 1) {
            into.adopt(this.outbox.items[i]);
        }
        this.outbox.count = 0;
    }
}
