# Generic list queries for API routes: `filter=` expression, multi-key
# `sort=`, and `offset`/`limit` pagination over any row source.
#
# A route supplies the row count, a field schema and a getter
# `(row, field) -> FValue`; Listing.run() returns the selected row numbers in
# page order. Rows keep their natural order unless sorted (stable merge
# sort), and `order=desc` reverses the natural order (newest first for logs).

import malloc, free from "std/c.bpl";
import [Request], [Response] from "bpl-express";
import [Text] from "../core/text.bpl";
import [JsonWriter] from "../core/json_writer.bpl";
import [Filter], [FValue], [FilterSchema], [SortSpec] from "./filter.bpl";
import [Params], [Page] from "./params.bpl";
import [Reply] from "./respond.bpl";

export [Listing];

struct Listing {
    rows: *int,
    count: int,
    total: int,
    page: Page,
    error: string,
    status: int,

    frame destroy(this: *Listing) {
        if (this.rows != nullptr) {
            free(cast<*void>(this.rows));
            this.rows = nullptr;
        }
    }

    frame failed(this: *Listing) ret bool {
        return this.error != nullptr;
    }

    # Sends the error response when the query failed; returns true if so.
    frame reject(this: *Listing, res: *Response) ret bool {
        if (this.error == nullptr) {
            return false;
        }
        Reply.error(res, this.status, this.error);
        return true;
    }

    frame run(req: *Request, n: int, names: *string, fields: int, get: Lambda<FValue>(int, int), default_limit: int, max_limit: int) ret Listing {
        local q: Listing;
        q.rows = nullptr;
        q.count = 0;
        q.total = 0;
        q.error = nullptr;
        q.status = 200;
        local p: Params = Params.of(req);
        q.page = p.page(default_limit, max_limit);
        local filter_text: string = p.str("filter", nullptr);
        local sort_text: string = p.str("sort", nullptr);
        local order: string = p.str("order", "asc");
        if (!Text.equals(order, "asc") && !Text.equals(order, "desc")) {
            p.fail("order", "must be asc or desc");
        }
        if (!p.ok()) {
            q.error = p.messages[0];
            q.status = 422;
            return q;
        }
        local schema: FilterSchema = FilterSchema.new(names, fields);
        local has_filter: bool = !Text.isEmpty(filter_text);
        local f: Filter = Filter.compile(has_filter ? filter_text : "true", schema);
        if (!f.ok()) {
            q.error = f.error;
            q.status = 400;
            f.destroy();
            return q;
        }
        local sort: SortSpec = SortSpec.parse(sort_text, &schema);
        if (sort.error != nullptr) {
            q.error = sort.error;
            q.status = 400;
            f.destroy();
            return q;
        }
        local all: *int = cast<*int>(malloc(cast<long>(n + 1) * sizeof(int)));
        local matched: int = 0;
        local reverse: bool = Text.equals(order, "desc");
        loop (local k: int = 0; k < n; k = k + 1) {
            local row: int = reverse ? (n - 1) - k : k;
            local accept: bool = true;
            if (has_filter) {
                local one: Lambda<FValue>(int) = |field: int| ret FValue {
                    return get(row, field);
                };
                accept = f.matches(one);
            }
            if (accept) {
                all[matched] = row;
                matched = matched + 1;
            }
        }
        f.destroy();
        if (sort.count > 0) {
            Listing.sortRows(all, matched, &sort, get);
        }
        q.total = matched;
        local start: int = q.page.offset < matched ? q.page.offset : matched;
        local end: int = (start + q.page.limit) < matched ? start + q.page.limit : matched;
        q.count = end - start;
        q.rows = cast<*int>(malloc(cast<long>(q.count + 1) * sizeof(int)));
        loop (local k: int = start; k < end; k = k + 1) {
            q.rows[k - start] = all[k];
        }
        free(cast<*void>(all));
        return q;
    }

    frame sortRows(idx: *int, n: int, sort: *SortSpec, get: Lambda<FValue>(int, int)) {
        local tmp: *int = cast<*int>(malloc(cast<long>(n + 1) * sizeof(int)));
        local width: int = 1;
        loop (width < n) {
            local left: int = 0;
            loop (left < n) {
                local mid: int = (left + width) < n ? left + width : n;
                local right: int = (left + (2 * width)) < n ? left + (2 * width) : n;
                local a: int = left;
                local b: int = mid;
                local k: int = left;
                loop ((a < mid) && (b < right)) {
                    local ra: int = idx[a];
                    local rb: int = idx[b];
                    local ga: Lambda<FValue>(int) = |field: int| ret FValue {
                        return get(ra, field);
                    };
                    local gb: Lambda<FValue>(int) = |field: int| ret FValue {
                        return get(rb, field);
                    };
                    if (sort.compareRecords(gb, ga) < 0) {
                        tmp[k] = rb;
                        b = b + 1;
                    } else {
                        tmp[k] = ra;
                        a = a + 1;
                    }
                    k = k + 1;
                }
                loop (a < mid) {
                    tmp[k] = idx[a];
                    a = a + 1;
                    k = k + 1;
                }
                loop (b < right) {
                    tmp[k] = idx[b];
                    b = b + 1;
                    k = k + 1;
                }
                left = left + (2 * width);
            }
            loop (local i: int = 0; i < n; i = i + 1) {
                idx[i] = tmp[i];
            }
            width = width * 2;
        }
        free(cast<*void>(tmp));
    }

    # Writes total/offset/limit/count (and next_offset) for the page.
    frame writePaging(this: *Listing, w: *JsonWriter) {
        w.fieldInt("total", cast<long>(this.total));
        w.fieldInt("offset", cast<long>(this.page.offset));
        w.fieldInt("limit", cast<long>(this.page.limit));
        w.fieldInt("count", cast<long>(this.count));
        if ((this.page.offset + this.count) < this.total) {
            w.fieldInt("next_offset", cast<long>(this.page.offset + this.count));
        }
    }

    # Writes every field of a row as a JSON object (numbers, strings, bools).
    frame writeRow(w: *JsonWriter, names: *string, fields: int, row: int, get: Lambda<FValue>(int, int)) {
        w.beginObject();
        loop (local f: int = 0; f < fields; f = f + 1) {
            local v: FValue = get(row, f);
            w.key(names[f]);
            if (v.kind == FValue.none().kind) {
                w.nil();
            } else if (v.str != nullptr) {
                w.str(v.str);
            } else if (v.kind == FValue.boolean(true).kind) {
                w.boolean(v.num != 0.0);
            } else {
                w.num(v.num);
            }
        }
        w.endObject();
    }
}
